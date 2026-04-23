/**
 * **Tests first** — chat thread E2EE indicator + inline “cannot decrypt” when the peer-decrypt hook has stored
 * **`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** (same outcome as missing **`encryptedMessageKeys[myDeviceId]`** on the wire).
 * **`useConversation`** is stubbed so **`hydrateMessagesFromFetch`** does not replace preloaded **`messaging`** state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import type { components } from '@/generated/api-types';
import { MESSAGE_HYBRID_ALGORITHM } from '@/common/crypto/messageHybrid';
import { defaultMockUser } from '@/common/mocks/handlers';
import { server } from '@/common/mocks/server';
import { renderWithProviders } from '@/common/test-utils';
import { mockSendMessageSocketLike } from '@/common/test-utils/mockSendMessageForVitest';
import { messagingInitialState } from '@/modules/home/stores/messagingSlice';
import {
  PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
} from '@/modules/home/utils/peerDecryptInline';
import { HomeConversationShell } from './HomeConversationShell';

vi.mock('@/common/hooks/useSendEncryptedMessage', () => ({
  useSendEncryptedMessage: () => ({
    sendMessage: async (payload: components['schemas']['SendMessageRequest']) =>
      mockSendMessageSocketLike(payload),
  }),
}));

vi.mock('@/modules/home/hooks/useConversation', () => ({
  useConversation: () => ({
    isLoading: false,
    isValidating: false,
    error: undefined,
    mutate: vi.fn(),
    /** Prevents **`hydrateMessagesFromFetch`** from clearing preloaded decrypt overlay state. */
    data: undefined,
  }),
}));

vi.mock('@/modules/home/hooks/usePeerMessageDecryption', () => ({
  usePeerMessageDecryption: () => {},
}));

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
    setPresenceHeartbeatMode: vi.fn(),
    setWebRtcInboundHandler: vi.fn(),
    status: { kind: 'connected', socketId: 'sk-test' },
    sendMessage: vi.fn(),
  }),
}));

describe('HomeConversationShell (E2EE thread UX)', () => {
  beforeEach(() => {
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

  it('shows the persistent E2EE indicator and peer decrypt_error when myDeviceId has no wrapped key entry', async () => {
    const convId = 'conv-e2ee-peer';
    const messageId = 'msg-hybrid-no-my-device';

    server.use(
      http.get('*/v1/conversations', () =>
        HttpResponse.json({
          items: [
            {
              id: convId,
              title: null,
              isGroup: false,
              peerUserId: 'peer-77',
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
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
        messaging: {
          ...messagingInitialState,
          activeConversationId: convId,
          messageIdsByConversationId: {
            [convId]: [messageId],
          },
          messagesById: {
            [messageId]: {
              id: messageId,
              conversationId: convId,
              senderId: 'peer-77',
              body: 'Ym9keVNhbXBsZUJpZ0Jhc2U2NA==',
              iv: 'aXZpdjEyNDU2Nzg5',
              algorithm: MESSAGE_HYBRID_ALGORITHM,
              /** Only another device — simulates missing **`encryptedMessageKeys[myDeviceId]`** for this browser. */
              encryptedMessageKeys: { 'other-device-id': 'e30=' },
              mediaKey: null,
              createdAt: '2026-01-01T12:00:00.000Z',
            },
          },
          decryptedBodyByMessageId: {
            [messageId]: PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
          },
        },
      },
    });

    const shell = await screen.findByTestId('home-conversation-shell');

    expect(
      within(shell).getByTestId('e2ee-messaging-indicator'),
    ).toHaveTextContent(/end-to-end encrypted/i);

    const alert = await within(shell).findByRole('alert');
    expect(alert).toHaveTextContent(/can't decrypt older messages/i);
    expect(alert).toHaveTextContent(/multi-device sync/i);
    expect(alert.className).toMatch(/text-destructive/);
  });
});
