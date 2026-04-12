import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { renderWithProviders } from '@/common/test-utils';
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
