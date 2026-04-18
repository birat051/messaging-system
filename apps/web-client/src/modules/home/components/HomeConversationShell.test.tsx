import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import { messagingInitialState } from '@/modules/home/stores/messagingSlice';
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
      await within(shell).findByText(/no messages yet/i),
    ).toBeInTheDocument();

    expect(
      await within(shell).findByTestId('e2ee-messaging-indicator'),
    ).toBeInTheDocument();
    expect(
      within(shell).getByTestId('e2ee-messaging-indicator'),
    ).toHaveTextContent(/end-to-end encrypted/i);
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
