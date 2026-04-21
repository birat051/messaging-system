import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
import { PEER_DECRYPT_NO_DEVICE_KEY_ENTRY } from '@/modules/home/utils/peerDecryptInline';
import { ThreadMessageList } from './ThreadMessageList';

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
