import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import {
  appendIncomingMessageIfNew,
  messagingInitialState,
} from '@/modules/home/stores/messagingSlice';
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

const setPresenceHeartbeatModeMock = vi.hoisted(() => vi.fn());

vi.mock('@/common/realtime/SocketWorkerProvider', () => ({
  useSocketWorker: () => ({
    emitReceipt: emitReceiptMock,
    emitWebRtcSignaling: vi.fn().mockResolvedValue(undefined),
    getLastSeen: getLastSeenMock,
    setPresenceHeartbeatMode: setPresenceHeartbeatModeMock,
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
    getLastSeenMock.mockClear();
    setPresenceHeartbeatModeMock.mockClear();
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
    expect(placeholder).toHaveClass('items-center', 'justify-center');
    expect(
      within(placeholder).getByText(/choose a conversation to view messages/i),
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

    it('shows @username for a guest peer when displayName is absent (GET user includes username)', async () => {
      const u = userEvent.setup();
      const guestPeerId = 'guest-peer-uuid-1';
      const items: Conversation[] = [
        {
          id: 'conv-guest',
          title: null,
          isGroup: false,
          peerUserId: guestPeerId,
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
          if (id !== guestPeerId) {
            return HttpResponse.json({
              id,
              guest: false,
              username: null,
              displayName: null,
              profilePicture: null,
              status: null,
            });
          }
          return HttpResponse.json({
            id,
            guest: true,
            username: 'tea_guest',
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
        within(shell).getByRole('button', { name: /@tea_guest/i }),
      ).toBeInTheDocument();

      await u.click(within(shell).getByRole('button', { name: /@tea_guest/i }));

      expect(
        within(shell).getByTestId('thread-header-title'),
      ).toHaveTextContent('@tea_guest');
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

  it('focused direct thread invokes compact heartbeat + getLastSeen (mock socket)', async () => {
    const selfId = defaultMockUser.id;
    const peerId = 'peer-focused-live';
    const convId = 'conv-focused-live';
    const msgId = 'm-focused-1';

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [
            {
              id: convId,
              title: null,
              isGroup: false,
              peerUserId: peerId,
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
          activeConversationId: convId,
          messageIdsByConversationId: { [convId]: [msgId] },
          messagesById: {
            [msgId]: {
              id: msgId,
              conversationId: convId,
              senderId: peerId,
              body: 'hello focus',
              mediaKey: null,
              createdAt: '2026-01-01T12:00:00.000Z',
            },
          },
        },
      },
    });

    expect(await screen.findByText('hello focus')).toBeInTheDocument();

    await waitFor(() => {
      expect(
        setPresenceHeartbeatModeMock.mock.calls.some(
          (c) => c[0] === 'active_thread',
        ),
      ).toBe(true);
    });

    await waitFor(() => {
      expect(getLastSeenMock).toHaveBeenCalledWith(peerId);
    });
  });

  it('thread header shows peer presence when getLastSeen returns redis (mock socket)', async () => {
    getLastSeenMock.mockResolvedValue({
      status: 'ok',
      source: 'redis',
      lastSeenAt: '2026-04-12T12:00:00.000Z',
    });
    const selfId = defaultMockUser.id;
    const peerId = 'peer-header-presence';
    const convId = 'conv-header-presence';

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [
            {
              id: convId,
              title: null,
              isGroup: false,
              peerUserId: peerId,
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
          activeConversationId: convId,
        },
      },
    });

    const shell = await screen.findByTestId('home-conversation-shell');
    expect(await within(shell).findByTestId('thread-header-presence')).toHaveTextContent(
      'Online',
    );
  });

  it('§6: message:new fan-in sets scroll target on active thread; list scrolls + clear', async () => {
    const selfId = defaultMockUser.id;
    const peerId = 'peer-fan-in';
    const convId = 'conv-fan-in-scroll';
    const existingMsgId = 'm-existing';

    const proto = Element.prototype as Element & {
      scrollIntoView?: (arg?: ScrollIntoViewOptions) => void;
    };
    const prevSiv = proto.scrollIntoView;
    const scrollIntoViewSpy = vi.fn();
    proto.scrollIntoView = scrollIntoViewSpy;

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [
            {
              id: convId,
              title: null,
              isGroup: false,
              peerUserId: peerId,
              updatedAt: '2026-01-01T12:00:00.000Z',
            },
          ],
          nextCursor: null,
          hasMore: false,
        }),
      ),
    );

    try {
      const { store } = renderWithProviders(<HomeConversationShell />, {
        preloadedState: {
          auth: {
            user: { ...defaultMockUser, id: selfId, emailVerified: true },
            accessToken: 'test-token',
          },
          messaging: {
            ...messagingInitialState,
            activeConversationId: convId,
            messageIdsByConversationId: { [convId]: [existingMsgId] },
            messagesById: {
              [existingMsgId]: {
                id: existingMsgId,
                conversationId: convId,
                senderId: peerId,
                body: 'existing line',
                mediaKey: null,
                createdAt: '2026-01-01T12:00:00.000Z',
              },
            },
          },
        },
      });

      const shell = await screen.findByTestId('home-conversation-shell');
      const log = await within(shell).findByRole('log', {
        name: /conversation messages/i,
      });
      expect(await within(log).findByText('existing line')).toBeInTheDocument();

      const incomingId = 'm-fan-in-new';
      store.dispatch(
        appendIncomingMessageIfNew({
          message: {
            id: incomingId,
            conversationId: convId,
            senderId: peerId,
            body: 'fan in line',
            mediaKey: null,
            createdAt: '2026-01-02T15:00:00.000Z',
          },
          currentUserId: selfId,
        }),
      );

      expect(await within(log).findByText('fan in line')).toBeInTheDocument();

      await waitFor(() => {
        expect(store.getState().messaging.scrollTargetMessageId).toBeNull();
        expect(scrollIntoViewSpy).toHaveBeenCalledWith({ block: 'nearest' });
      });
    } finally {
      if (prevSiv) {
        proto.scrollIntoView = prevSiv;
      } else {
        Reflect.deleteProperty(proto, 'scrollIntoView');
      }
    }
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

  it('pending guest peer without displayName shows @username in thread header', async () => {
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
            userId: 'guest-pending-1',
            username: 'guest_handle',
            displayName: null,
            profilePicture: null,
            conversationId: null,
            guest: true,
          },
        ]),
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
    const bar = screen.getByTestId('user-search-bar');
    await u.type(
      within(bar).getByRole('textbox', { name: /search users/i }),
      'gue',
    );
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

    const results = await screen.findByTestId('user-search-results');
    await u.click(
      within(results).getByRole('button', { name: /@guest_handle/i }),
    );

    expect(
      within(shell).getByTestId('thread-header-title'),
    ).toHaveTextContent('@guest_handle');
  });
});
