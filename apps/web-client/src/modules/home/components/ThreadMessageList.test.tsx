import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { messagingInitialState } from '@/modules/home/stores/messagingSlice';
import { PEER_DECRYPT_NO_DEVICE_KEY_ENTRY } from '@/modules/home/utils/peerDecryptInline';
import {
  queryThreadMessageRowInLog,
  ThreadMessageList,
} from './ThreadMessageList';

const T0 = '2026-04-12T10:00:00.000Z';
const T1 = '2026-04-12T11:30:00.000Z';

describe('ThreadMessageList', () => {
  it('uses a log region with polite live updates when messages exist', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[
          { id: '1', body: 'Hello', isOwn: false, createdAt: T0 },
          { id: '2', body: 'Hi there', isOwn: true, createdAt: T1 },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    expect(log).toHaveAttribute('aria-live', 'polite');
  });

  it('§6.3: scrolls after error clears when log viewport was not mounted (retry path)', async () => {
    vi.useFakeTimers();
    const proto = Element.prototype as Element & {
      scrollIntoView?: (arg?: ScrollIntoViewOptions) => void;
    };
    const scrollIntoView = vi.fn();
    const prev = proto.scrollIntoView;
    proto.scrollIntoView = scrollIntoView;
    try {
      const cid = 'conv-err-clear';
      const mid = 'msg-err-clear';
      const { rerender, store } = renderWithProviders(
        <ThreadMessageList
          errorMessage="Could not load"
          conversationScrollKey={cid}
          messages={[{ id: mid, body: 'x', isOwn: false, createdAt: T0 }]}
        />,
        {
          preloadedState: {
            messaging: {
              ...messagingInitialState,
              activeConversationId: cid,
              scrollTargetMessageId: mid,
              scrollTargetConversationId: cid,
              scrollTargetReason: 'message_new',
              scrollTargetNonce: 3,
            },
          },
        },
      );
      expect(scrollIntoView).not.toHaveBeenCalled();
      expect(store.getState().messaging.scrollTargetMessageId).toBe(mid);

      rerender(
        <ThreadMessageList
          conversationScrollKey={cid}
          messages={[{ id: mid, body: 'x', isOwn: false, createdAt: T0 }]}
        />,
      );
      await vi.advanceTimersByTimeAsync(60);
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(store.getState().messaging.scrollTargetMessageId).toBeNull();
    } finally {
      if (prev) {
        proto.scrollIntoView = prev;
      } else {
        Reflect.deleteProperty(proto, 'scrollIntoView');
      }
      vi.useRealTimers();
    }
  });

  it('§6.3: clears scroll target when message id never appears (max retries)', async () => {
    vi.useFakeTimers();
    try {
      const cid = 'conv-timeout';
      const mid = 'msg-missing';
      const { store } = renderWithProviders(
        <ThreadMessageList
          conversationScrollKey={cid}
          messages={[{ id: 'other', body: 'o', isOwn: false, createdAt: T0 }]}
        />,
        {
          preloadedState: {
            messaging: {
              ...messagingInitialState,
              activeConversationId: cid,
              scrollTargetMessageId: mid,
              scrollTargetConversationId: cid,
              scrollTargetNonce: 4,
            },
          },
        },
      );
      expect(store.getState().messaging.scrollTargetMessageId).toBe(mid);
      /** Matches **`SCROLL_TARGET_MAX_RETRIES`** × **`SCROLL_TARGET_RETRY_MS`** + slack. */
      await vi.advanceTimersByTimeAsync(50 * 92);
      expect(store.getState().messaging.scrollTargetMessageId).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('§6: scrollIntoView(nearest) when Redux scroll target matches active thread and message list, then clears', () => {
    const proto = Element.prototype as Element & {
      scrollIntoView?: (arg?: ScrollIntoViewOptions) => void;
    };
    const scrollIntoView = vi.fn();
    const prev = proto.scrollIntoView;
    proto.scrollIntoView = scrollIntoView;
    try {
      const cid = 'conv-scroll-6';
      const mid = 'msg-scroll-6';
      const { store } = renderWithProviders(
        <ThreadMessageList
          conversationScrollKey={cid}
          messages={[{ id: mid, body: 'hi', isOwn: false, createdAt: T0 }]}
        />,
        {
          preloadedState: {
            messaging: {
              ...messagingInitialState,
              activeConversationId: cid,
              scrollTargetMessageId: mid,
              scrollTargetConversationId: cid,
              scrollTargetReason: 'send_ack',
              scrollTargetNonce: 1,
            },
          },
        },
      );
      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
      expect(store.getState().messaging.scrollTargetMessageId).toBeNull();
      expect(store.getState().messaging.scrollTargetConversationId).toBeNull();
    } finally {
      if (prev) {
        proto.scrollIntoView = prev;
      } else {
        Reflect.deleteProperty(proto, 'scrollIntoView');
      }
    }
  });

  it('sets data-message-id on each row article for programmatic scroll (§6)', () => {
    const clientId = 'client:11111111-1111-1111-1111-111111111111';
    renderWithProviders(
      <ThreadMessageList
        messages={[
          { id: 'srv-1', body: 'Hello', isOwn: false, createdAt: T0 },
          { id: clientId, body: 'Pending', isOwn: true, createdAt: T1 },
        ]}
      />,
    );

    const scroll = screen.getByTestId('thread-message-scroll');
    const row1 = queryThreadMessageRowInLog(scroll, 'srv-1');
    const rowClient = queryThreadMessageRowInLog(scroll, clientId);
    expect(row1).toBeInstanceOf(HTMLElement);
    expect(row1).toHaveAttribute('data-message-id', 'srv-1');
    expect(rowClient).toHaveAttribute('data-message-id', clientId);
    expect(row1?.tagName).toBe('ARTICLE');
  });

  it('exposes a scrollable region for the message log', () => {
    renderWithProviders(
      <div className="flex h-64 flex-col">
        <ThreadMessageList
          messages={[{ id: '1', body: 'Hello', isOwn: false, createdAt: T0 }]}
        />
      </div>,
    );

    const scroll = screen.getByTestId('thread-message-scroll');
    expect(scroll.className).toMatch(/overflow-y-auto/);
    expect(scroll.className).toMatch(/overflow-x-hidden/);
    expect(scroll.className).toMatch(/min-w-0/);
  });

  it('scrolls to bottom when a new message is appended while pinned to bottom', () => {
    let scrollTop = 0;
    const m1 = { id: '1', body: 'first', isOwn: false, createdAt: T0 };
    const m2 = { id: '2', body: 'second', isOwn: false, createdAt: T1 };

    const { rerender } = renderWithProviders(
      <ThreadMessageList messages={[m1]} conversationScrollKey={null} />,
    );
    const el = screen.getByTestId('thread-message-scroll');
    const metrics = { scrollHeight: 1000, clientHeight: 200 };
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => metrics.scrollHeight,
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => metrics.clientHeight,
    });
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });

    rerender(<ThreadMessageList messages={[m1]} conversationScrollKey="c1" />);
    expect(scrollTop).toBe(800);

    metrics.scrollHeight = 2000;
    rerender(<ThreadMessageList messages={[m1, m2]} conversationScrollKey="c1" />);
    expect(scrollTop).toBe(1800);
  });

  it('§6.4: skips pin scrollLogToBottom when Redux scroll target is already the tail row (dedupe §6)', () => {
    const proto = Element.prototype as Element & {
      scrollIntoView?: (arg?: ScrollIntoViewOptions) => void;
    };
    const prevSiv = proto.scrollIntoView;
    proto.scrollIntoView = vi.fn();
    let scrollTop = 0;
    const cid = 'c-dedupe-tail';
    const tailId = 'm-tail';
    try {
    renderWithProviders(
      <div className="flex h-64 flex-col">
        <ThreadMessageList
          conversationScrollKey={cid}
          messages={[
            { id: 'm1', body: 'a', isOwn: false, createdAt: T0 },
            { id: tailId, body: 'b', isOwn: false, createdAt: T1 },
          ]}
        />
      </div>,
      {
        preloadedState: {
          messaging: {
            ...messagingInitialState,
            activeConversationId: cid,
            scrollTargetMessageId: tailId,
            scrollTargetConversationId: cid,
            scrollTargetNonce: 1,
          },
        },
      },
    );
    const el = screen.getByTestId('thread-message-scroll');
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => 200,
    });
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });
    /** Pin-only would set **`scrollTop`** to **800**; skipped so §6 **`scrollIntoView`** owns this append. */
    expect(scrollTop).not.toBe(800);
    } finally {
      if (prevSiv) {
        proto.scrollIntoView = prevSiv;
      } else {
        Reflect.deleteProperty(proto, 'scrollIntoView');
      }
    }
  });

  it('does not auto-scroll when the user scrolled away from the bottom (tail still updates)', () => {
    let scrollTop = 0;
    const m1 = { id: '1', body: 'first', isOwn: false, createdAt: T0 };
    const m2 = { id: '2', body: 'second', isOwn: false, createdAt: T1 };

    const { rerender } = renderWithProviders(
      <ThreadMessageList messages={[m1]} conversationScrollKey={null} />,
    );
    const el = screen.getByTestId('thread-message-scroll');
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => 200,
    });
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });

    rerender(<ThreadMessageList messages={[m1]} conversationScrollKey="c1" />);
    expect(scrollTop).toBe(800);

    scrollTop = 0;
    fireEvent.scroll(el);
    rerender(<ThreadMessageList messages={[m1, m2]} conversationScrollKey="c1" />);
    expect(scrollTop).toBe(0);
  });

  it('scrolls to bottom when conversationScrollKey changes (new active thread)', () => {
    let scrollTop = 0;
    const { rerender } = renderWithProviders(
      <ThreadMessageList
        messages={[{ id: 'a', body: 'in c1', isOwn: false, createdAt: T0 }]}
        conversationScrollKey={null}
      />,
    );
    const el = screen.getByTestId('thread-message-scroll');
    Object.defineProperty(el, 'scrollHeight', {
      configurable: true,
      get: () => 500,
    });
    Object.defineProperty(el, 'clientHeight', {
      configurable: true,
      get: () => 200,
    });
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v: number) => {
        scrollTop = v;
      },
    });

    rerender(
      <ThreadMessageList
        conversationScrollKey="c1"
        messages={[{ id: 'a', body: 'in c1', isOwn: false, createdAt: T0 }]}
      />,
    );
    expect(scrollTop).toBe(300);

    scrollTop = 50;
    rerender(
      <ThreadMessageList
        conversationScrollKey="c2"
        messages={[{ id: 'b', body: 'in c2', isOwn: false, createdAt: T1 }]}
      />,
    );
    expect(scrollTop).toBe(300);
  });

  it('applies wrapping classes to long message body text', () => {
    const longBody = `${'x'.repeat(200)} ${'y'.repeat(200)}`;
    renderWithProviders(
      <ThreadMessageList
        messages={[
          { id: 'long', body: longBody, isOwn: false, createdAt: T0 },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    const p = within(log).getByText(longBody);
    expect(p.className).toMatch(/break-words/);
    expect(p.className).toMatch(/whitespace-pre-wrap/);
    expect(p.className).toMatch(/min-w-0/);
  });

  it('renders timestamps with machine-readable datetime', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[
          { id: 'a', body: 'From peer', isOwn: false, createdAt: T0 },
          { id: 'b', body: 'From me', isOwn: true, createdAt: T1 },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    const times = log.querySelectorAll('time');
    expect(times).toHaveLength(2);
    expect(times[0]).toHaveAttribute('dateTime', T0);
    expect(times[1]).toHaveAttribute('dateTime', T1);
  });

  it('shows own row as resolved plaintext after send ack (resolveMessageDisplayBody)', () => {
    const resolvedPlain = 'Hello after simulated ack';
    renderWithProviders(
      <ThreadMessageList
        messages={[
          {
            id: 'm-after-ack',
            body: resolvedPlain,
            isOwn: true,
            createdAt: T1,
          },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    expect(within(log).getByText(resolvedPlain)).toBeInTheDocument();
  });

  it('styles peer decrypt inline errors as alerts', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[
          {
            id: 'e1',
            body: "Can't decrypt on this device.",
            bodyPresentation: 'decrypt_error',
            isOwn: false,
            createdAt: T0,
          },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    const alert = within(log).getByRole('alert');
    expect(alert).toHaveTextContent(/can't decrypt on this device/i);
    expect(alert.className).toMatch(/text-destructive/);
    expect(alert.className).toMatch(/italic/);
  });

  it('uses PEER_DECRYPT_NO_DEVICE_KEY_ENTRY for decrypt_error (missing encryptedMessageKeys[myDeviceId] path)', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[
          {
            id: 'e2',
            body: PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
            bodyPresentation: 'decrypt_error',
            isOwn: false,
            createdAt: T0,
          },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    expect(
      within(log).getByRole('alert'),
    ).toHaveTextContent(PEER_DECRYPT_NO_DEVICE_KEY_ENTRY);
  });

  it('renders message bodies and distinguishes own vs peer for assistive tech', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[
          { id: 'a', body: 'From peer', isOwn: false, createdAt: T0 },
          { id: 'b', body: 'From me', isOwn: true, createdAt: T1 },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    expect(within(log).getByText('From peer')).toBeInTheDocument();
    expect(within(log).getByText('From me')).toBeInTheDocument();

    expect(
      screen.getByRole('article', { name: /message from peer/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('article', { name: /message from you/i }),
    ).toBeInTheDocument();
  });

  it('shows attachment fallback when body is empty but mediaKey is set and media URL env is unset', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', '');
    vi.stubEnv('VITE_S3_BUCKET', '');
    try {
      renderWithProviders(
        <ThreadMessageList
          messages={[
            {
              id: 'm1',
              body: '',
              mediaKey: 'users/u1/obj.png',
              isOwn: true,
              createdAt: T0,
            },
          ]}
        />,
      );

      expect(screen.getByText('Attachment')).toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('peer image uses mock https URL as img src after decrypt when public env is unset (decrypted m.u path)', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', '');
    vi.stubEnv('VITE_S3_BUCKET', '');
    try {
      const decryptedPublicUrl = 'https://r2-public.example/users/1/photo.png';
      renderWithProviders(
        <ThreadMessageList
          messages={[
            {
              id: 'm-peer-hybrid-url',
              body: 'check this',
              mediaKey: 'users/1/photo.png',
              mediaPreviewUrl: decryptedPublicUrl,
              isOwn: false,
              createdAt: T0,
            },
          ]}
        />,
      );

      const log = screen.getByRole('log', { name: /conversation messages/i });
      const img = within(log).getByRole('img', {
        name: /image attachment from the other person/i,
      });
      expect(img).toHaveAttribute('src', decryptedPublicUrl);
      expect(within(log).queryByText(/^Attachment$/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders an image for image attachments when mediaPreviewUrl supplies a display URL (not the Attachment placeholder)', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', '');
    vi.stubEnv('VITE_S3_BUCKET', '');
    try {
      renderWithProviders(
        <ThreadMessageList
          messages={[
            {
              id: 'm-img',
              body: '',
              mediaKey: 'users/u1/photo.png',
              mediaPreviewUrl: 'blob:http://localhost/preview-1',
              isOwn: true,
              createdAt: T0,
            },
          ]}
        />,
      );

      const log = screen.getByRole('log', { name: /conversation messages/i });
      const img = within(log).getByRole('img', {
        name: /image attachment you sent/i,
      });
      expect(img).toHaveAttribute('src', 'blob:http://localhost/preview-1');
      expect(within(log).queryByText(/^Attachment$/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('renders Open attachment link for non-image mediaKey when public object URL is configured', () => {
    vi.stubEnv('VITE_S3_PUBLIC_BASE_URL', 'http://localhost:9000');
    vi.stubEnv('VITE_S3_BUCKET', 'messaging-media');
    try {
      renderWithProviders(
        <ThreadMessageList
          messages={[
            {
              id: 'm-pdf',
              body: '',
              mediaKey: 'users/u1/doc.pdf',
              isOwn: false,
              createdAt: T0,
            },
          ]}
        />,
      );

      const log = screen.getByRole('log', { name: /conversation messages/i });
      const link = within(log).getByRole('link', { name: /open attachment/i });
      expect(link.getAttribute('href')).toContain('doc.pdf');
      expect(within(log).queryByText(/^Attachment$/)).not.toBeInTheDocument();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('shows an empty status when there are no messages and not loading', () => {
    renderWithProviders(
      <ThreadMessageList messages={[]} emptyLabel="No messages in this thread" />,
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'No messages in this thread',
    );
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('shows loading when fetching and there are no messages yet', () => {
    renderWithProviders(<ThreadMessageList messages={[]} isLoading />);

    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent(/loading messages/i);
  });

  it('shows an error alert instead of the log when errorMessage is set', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[{ id: '1', body: 'Hi', isOwn: false, createdAt: T0 }]}
        errorMessage="Could not load messages"
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Could not load messages',
    );
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('marks the log as busy while validating when messages are already shown', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[{ id: '1', body: 'Hi', isOwn: false, createdAt: T0 }]}
        isValidating
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    expect(log).toHaveAttribute('aria-busy', 'true');
  });

  it('shows outbound receipt ticks for own messages when outboundReceipt is provided', () => {
    renderWithProviders(
      <ThreadMessageList
        messages={[
          {
            id: '1',
            body: 'Hi',
            isOwn: true,
            createdAt: T0,
            outboundReceipt: 'sent',
          },
        ]}
      />,
    );

    const log = screen.getByRole('log', { name: /conversation messages/i });
    const you = within(log).getByRole('article', { name: /message from you/i });
    expect(within(you).getByTestId('receipt-ticks')).toBeInTheDocument();
    const status = within(you).getByRole('status');
    expect(status).toHaveAttribute(
      'aria-label',
      expect.stringMatching(/sent/i),
    );
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  describe('inbound read (viewport)', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'IntersectionObserver',
        class {
          cb: IntersectionObserverCallback;
          constructor(cb: IntersectionObserverCallback) {
            this.cb = cb;
          }
          observe() {
            queueMicrotask(() => {
              this.cb(
                [{ isIntersecting: true } as IntersectionObserverEntry],
                this as unknown as IntersectionObserver,
              );
            });
          }
          disconnect() {}
          takeRecords() {
            return [];
          }
        } as unknown as typeof IntersectionObserver,
      );
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('invokes onPeerMessageVisible when a peer message intersects', async () => {
      const onPeerMessageVisible = vi.fn();
      renderWithProviders(
        <ThreadMessageList
          messages={[
            { id: 'p1', body: 'From peer', isOwn: false, createdAt: T0 },
          ]}
          onPeerMessageVisible={onPeerMessageVisible}
        />,
      );

      await vi.waitFor(() => {
        expect(onPeerMessageVisible).toHaveBeenCalledWith('p1');
      });
    });
  });
});
