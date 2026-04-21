import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import { messagingInitialState } from '@/modules/home/stores/messagingSlice';
import { SEARCH_DEBOUNCE_MS } from '@/modules/home/hooks/useUserSearchQuery';
import { formatMissingPeerProfileLabel } from '@/modules/home/utils/userPublicLabel';
import { HomeConversationShell } from './HomeConversationShell';

type Conversation = components['schemas']['Conversation'];

const emitReceiptMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

const getLastSeenMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ status: 'not_available' as const }),
);

vi.mock('@/common/realtime/SocketWorkerProvider', () => ({
  useSocketWorker: () => ({
    emitReceipt: emitReceiptMock,
    emitWebRtcSignaling: vi.fn().mockResolvedValue(undefined),
    getLastSeen: getLastSeenMock,
    setWebRtcInboundHandler: vi.fn(),
    status: { kind: 'connected', socketId: 'sk-test' },
    sendMessage: vi.fn(),
  }),
}));

vi.mock('@/modules/home/hooks/useConversation', () => ({
  useConversation: () => ({
    isLoading: false,
    isValidating: false,
    error: null,
  }),
}));

vi.mock('@/common/hooks/useSendEncryptedMessage', async () => {
  const { mockSendMessageSocketLike } = await import(
    '@/common/test-utils/mockSendMessageForVitest'
  );
  return {
    useSendEncryptedMessage: () => ({
      sendMessage: async (payload: components['schemas']['SendMessageRequest']) =>
        mockSendMessageSocketLike(payload),
    }),
  };
});

describe('HomeConversationShell', () => {
  beforeEach(() => {
    emitReceiptMock.mockClear();
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
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

  it('shows empty list when API returns no items', async () => {
    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    expect(await screen.findByText(/no conversations yet/i)).toBeInTheDocument();
  });

  it('shows an empty-thread placeholder centred in the thread pane when no chat is selected', async () => {
    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    const placeholder = await screen.findByTestId('thread-empty-placeholder');
    expect(placeholder).toHaveClass('items-center', 'justify-center', 'text-center');
    expect(
      within(placeholder).getByText(/select a conversation to open the thread/i),
    ).toBeInTheDocument();
  });

  it('selecting a row sets active selection and updates the main pane', async () => {
    const u = userEvent.setup();
    const items: Conversation[] = [
      {
        id: 'conv-aaa',
        title: null,
        isGroup: false,
        peerUserId: 'peer-aaa',
        updatedAt: '2026-01-01T12:00:00.000Z',
      },
      {
        id: 'conv-bbb',
        title: null,
        isGroup: false,
        peerUserId: 'peer-bbb',
        updatedAt: '2026-01-02T12:00:00.000Z',
      },
    ];

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items,
          nextCursor: null,
          hasMore: false,
        }),
      ),
      http.get('*/v1/users/:userId', ({ params }) => {
        const id = params.userId as string;
        const displayName =
          id === 'peer-bbb' ? 'Bruno' : id === 'peer-aaa' ? 'Ada' : null;
        return HttpResponse.json({
          id,
          guest: false,
          displayName,
          profilePicture: null,
          status: null,
        });
      }),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    const shell = await screen.findByTestId('home-conversation-shell');
    const buttons = await within(shell).findAllByRole('button');
    expect(buttons).toHaveLength(2);

    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');

    await u.click(buttons[1]!);

    expect(buttons[0]).toHaveAttribute('aria-pressed', 'false');
    expect(buttons[1]).toHaveAttribute('aria-pressed', 'true');

    expect(
      await within(shell).findByTestId('thread-header-title'),
    ).toHaveTextContent('Bruno');

    expect(
      await within(shell).findByText(/no messages yet/i),
    ).toBeInTheDocument();

    expect(
      await within(shell).findByTestId('e2ee-messaging-indicator'),
    ).toBeInTheDocument();
    expect(
      within(shell).getByTestId('e2ee-messaging-indicator'),
    ).toHaveTextContent(/end-to-end encrypted/i);
  });

  it('uses Note to self for a direct thread whose peer is the current user', async () => {
    const u = userEvent.setup();
    const selfId = defaultMockUser.id;
    const items: Conversation[] = [
      {
        id: 'conv-self',
        title: null,
        isGroup: false,
        peerUserId: selfId,
        updatedAt: '2026-01-01T12:00:00.000Z',
      },
    ];

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items,
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    const shell = await screen.findByTestId('home-conversation-shell');
    const row = await within(shell).findByRole('button', {
      name: /note to self/i,
    });
    await u.click(row);

    expect(
      await within(shell).findByTestId('thread-header-title'),
    ).toHaveTextContent('Note to self');

    expect(
      within(shell).queryByRole('button', { name: /^call$/i }),
    ).not.toBeInTheDocument();
  });

  describe('Conversation titling — list rows and thread header', () => {
    it('list rows show peer display names; thread header matches the selected peer', async () => {
      const u = userEvent.setup();
      const items: Conversation[] = [
        {
          id: 'conv-1',
          title: null,
          isGroup: false,
          peerUserId: 'peer-ada',
          updatedAt: '2026-01-01T12:00:00.000Z',
        },
        {
          id: 'conv-2',
          title: null,
          isGroup: false,
          peerUserId: 'peer-bruno',
          updatedAt: '2026-01-02T12:00:00.000Z',
        },
      ];

      server.use(
        http.get('*/v1/conversations', () =>
          HttpResponse.json({
            items,
            nextCursor: null,
            hasMore: false,
          }),
        ),
        http.get('*/v1/users/:userId', ({ params }) => {
          const id = params.userId as string;
          const displayName =
            id === 'peer-ada' ? 'Ada' : id === 'peer-bruno' ? 'Bruno' : null;
          return HttpResponse.json({
            id,
            guest: false,
            displayName,
            profilePicture: null,
            status: null,
          });
        }),
      );

      renderWithProviders(<HomeConversationShell />, {
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      });

      const shell = await screen.findByTestId('home-conversation-shell');
      expect(
        within(shell).getByRole('button', { name: /Ada/i }),
      ).toBeInTheDocument();
      expect(
        within(shell).getByRole('button', { name: /Bruno/i }),
      ).toBeInTheDocument();

      await u.click(within(shell).getByRole('button', { name: /Ada/i }));

      expect(
        within(shell).getByTestId('thread-header-title'),
      ).toHaveTextContent('Ada');
    });

    it('uses explicit conversation title in list and thread header when the API provides one', async () => {
      const u = userEvent.setup();
      const items: Conversation[] = [
        {
          id: 'conv-titled',
          title: 'Book Club',
          isGroup: false,
          peerUserId: 'peer-x',
          updatedAt: '2026-01-01T12:00:00.000Z',
        },
      ];

      server.use(
        http.get('*/v1/conversations', () =>
          HttpResponse.json({
            items,
            nextCursor: null,
            hasMore: false,
          }),
        ),
      );

      renderWithProviders(<HomeConversationShell />, {
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      });

      const shell = await screen.findByTestId('home-conversation-shell');
      expect(
        within(shell).getByRole('button', { name: /Book Club/i }),
      ).toBeInTheDocument();

      await u.click(within(shell).getByRole('button', { name: /Book Club/i }));

      expect(
        within(shell).getByTestId('thread-header-title'),
      ).toHaveTextContent('Book Club');
    });

    it('uses group title in list and thread header for group threads', async () => {
      const u = userEvent.setup();
      const items: Conversation[] = [
        {
          id: 'conv-g',
          title: 'Family Chat',
          isGroup: true,
          peerUserId: null,
          memberIds: [defaultMockUser.id, 'other-user'],
          updatedAt: '2026-01-01T12:00:00.000Z',
        },
      ];

      server.use(
        http.get('*/v1/conversations', () =>
          HttpResponse.json({
            items,
            nextCursor: null,
            hasMore: false,
          }),
        ),
      );

      renderWithProviders(<HomeConversationShell />, {
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      });

      const shell = await screen.findByTestId('home-conversation-shell');
      await u.click(
        within(shell).getByRole('button', { name: /Family Chat/i }),
      );

      expect(
        within(shell).getByTestId('thread-header-title'),
      ).toHaveTextContent('Family Chat');
    });

    it('falls back to unknown-contact label when peer profile cannot be loaded', async () => {
      const u = userEvent.setup();
      const peerId = 'zz-missing-99';
      const expectedLabel = formatMissingPeerProfileLabel(peerId);
      const items: Conversation[] = [
        {
          id: 'conv-miss',
          title: null,
          isGroup: false,
          peerUserId: peerId,
          updatedAt: '2026-01-01T12:00:00.000Z',
        },
      ];

      server.use(
        http.get('*/v1/conversations', () =>
          HttpResponse.json({
            items,
            nextCursor: null,
            hasMore: false,
          }),
        ),
        http.get('*/v1/users/:userId', ({ params }) => {
          const id = params.userId as string;
          if (id === peerId) {
            return HttpResponse.json(
              { code: 'NOT_FOUND', message: 'No user' },
              { status: 404 },
            );
          }
          return HttpResponse.json({
            id,
            guest: false,
            displayName: null,
            profilePicture: null,
            status: null,
          });
        }),
      );

      renderWithProviders(<HomeConversationShell />, {
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, emailVerified: true },
            accessToken: 'test-token',
          },
        },
      });

      const shell = await screen.findByTestId('home-conversation-shell');
      expect(
        within(shell).getByRole('button', { name: new RegExp(expectedLabel, 'i') }),
      ).toBeInTheDocument();

      await u.click(
        within(shell).getByRole('button', { name: new RegExp(expectedLabel, 'i') }),
      );

      expect(
        within(shell).getByTestId('thread-header-title'),
      ).toHaveTextContent(expectedLabel);
    });
  });

  it('does not emit conversation:read or message:read when receipts already show seen for current user', async () => {
    const selfId = 'test-user-1';
    const peerMsgId = 'm-peer-1';

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [
            {
              id: 'conv-pre',
              title: null,
              isGroup: false,
              peerUserId: 'peer-x',
              updatedAt: '2026-01-01T12:00:00.000Z',
            },
          ],
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, id: selfId, emailVerified: true },
          accessToken: 'test-token',
        },
        messaging: {
          ...messagingInitialState,
          activeConversationId: 'conv-pre',
          messageIdsByConversationId: { 'conv-pre': [peerMsgId] },
          messagesById: {
            [peerMsgId]: {
              id: peerMsgId,
              conversationId: 'conv-pre',
              senderId: 'peer-x',
              body: 'hello',
              mediaKey: null,
              createdAt: '2026-01-01T12:00:00.000Z',
            },
          },
          receiptsByMessageId: {
            [peerMsgId]: {
              messageId: peerMsgId,
              conversationId: 'conv-pre',
              createdAt: '2026-01-01T12:00:00.000Z',
              receiptsByUserId: {
                [selfId]: { seenAt: '2026-01-01T12:05:00.000Z' },
              },
            },
          },
        },
      },
    });

    expect(await screen.findByText('hello')).toBeInTheDocument();

    await waitFor(() => {
      expect(emitReceiptMock).not.toHaveBeenCalled();
    });
  });
});

describe('HomeConversationShell — user search (bar + list column)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('search bar is inline (no dialog); valid query shows results in the list column', async () => {
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
      ),
      http.get('*/v1/users/search', () => HttpResponse.json([])),
    );

    renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    const bar = screen.getByTestId('user-search-bar');
    const input = within(bar).getByRole('textbox', { name: /search users/i });
    await u.type(input, 'nom');
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    await waitFor(() => {
      const results = screen.getByTestId('user-search-results');
      expect(
        within(results).getByText(/no users match that search text/i),
      ).toBeInTheDocument();
    });
  });

  it('result with conversationId activates that conversation', async () => {
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
      ),
      http.get('*/v1/users/search', () =>
        HttpResponse.json([
          {
            userId: 'u-existing',
            username: 'pat',
            displayName: 'Pat Lee',
            profilePicture: null,
            conversationId: 'conv-existing-99',
            guest: false,
          },
        ]),
      ),
    );

    const { store } = renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    const bar = screen.getByTestId('user-search-bar');
    await u.type(
      within(bar).getByRole('textbox', { name: /search users/i }),
      'pat',
    );
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    const results = await screen.findByTestId('user-search-results');
    await waitFor(() => {
      expect(
        within(results).getByRole('button', { name: /pat lee/i }),
      ).toBeInTheDocument();
    });

    await u.click(within(results).getByRole('button', { name: /pat lee/i }));

    expect(store.getState().messaging.activeConversationId).toBe(
      'conv-existing-99',
    );
  });

  it('result without conversationId sets pending direct peer (main thread composer)', async () => {
    const u = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [],
          nextCursor: null,
          hasMore: false,
        }),
      ),
      http.get('*/v1/users/search', () =>
        HttpResponse.json([
          {
            userId: 'u-new',
            username: 'new_u',
            displayName: 'New Person',
            profilePicture: null,
            conversationId: null,
            guest: false,
          },
        ]),
      ),
    );

    const { store } = renderWithProviders(<HomeConversationShell />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    const bar = screen.getByTestId('user-search-bar');
    await u.type(
      within(bar).getByRole('textbox', { name: /search users/i }),
      'new',
    );
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    const results = await screen.findByTestId('user-search-results');
    await u.click(within(results).getByRole('button', { name: /new person/i }));

    expect(store.getState().messaging.pendingDirectPeer?.userId).toBe('u-new');
    expect(screen.queryByTestId('user-search-results')).not.toBeInTheDocument();
  });
});
