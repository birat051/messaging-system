import { renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';
import { createTestStore, renderWithProviders } from '@/common/test-utils';
import { mockSendMessageSocketLike } from '@/common/test-utils/mockSendMessageForVitest';
import { MESSAGE_HYBRID_ALGORITHM } from '@/common/crypto/messageHybrid';
import {
  RECIPIENT_NO_HYBRID_DEVICE_KEYS_MESSAGE,
  SENDER_NO_HYBRID_DEVICE_KEYS_MESSAGE,
  useSendEncryptedMessage,
} from './useSendEncryptedMessage';

const ensureUserKeypairReadyForMessaging = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock('../crypto/ensureMessagingKeypair', () => ({
  ensureUserKeypairReadyForMessaging: (
    userId: string,
    dispatch: unknown,
  ) => ensureUserKeypairReadyForMessaging(userId, dispatch),
}));

const encryptUtf8ToHybridSendPayload = vi.hoisted(() => vi.fn());

vi.mock('../crypto/messageHybrid', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../crypto/messageHybrid')>();
  return {
    ...actual,
    encryptUtf8ToHybridSendPayload,
  };
});

const socketSend = vi.hoisted(() =>
  vi.fn(async (payload: components['schemas']['SendMessageRequest']) =>
    mockSendMessageSocketLike(payload),
  ),
);

vi.mock('./useSocketWorkerSendMessage', () => ({
  useSocketWorkerSendMessage: () => ({
    sendMessage: socketSend,
  }),
}));

function freshDeviceKeysEntry(items: { deviceId: string; publicKey: string }[]) {
  return {
    status: 'succeeded' as const,
    items,
    forbidden: false,
    error: null,
    cachedAtMs: Date.now(),
  };
}

function SendHarness() {
  const { sendMessage } = useSendEncryptedMessage({
    peerUserId: 'peer-1',
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        onClick={async () => {
          setError(null);
          try {
            await sendMessage({
              body: 'Hello',
              recipientUserId: 'peer-1',
            });
          } catch (e: unknown) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      >
        Send encrypted
      </button>
      {error ? <div role="alert">{error}</div> : null}
    </>
  );
}

function hookWrapper(store: ReturnType<typeof createTestStore>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  };
}

describe('useSendEncryptedMessage', () => {
  beforeEach(() => {
    ensureUserKeypairReadyForMessaging.mockClear();
    encryptUtf8ToHybridSendPayload.mockReset();
    socketSend.mockClear();
  });

  it('happy path: ensures keypair, encrypts hybrid payload, sends', async () => {
    encryptUtf8ToHybridSendPayload.mockResolvedValue({
      algorithm: MESSAGE_HYBRID_ALGORITHM,
      body: 'cipher-b64-mock',
      iv: 'iv-b64-mock',
      encryptedMessageKeys: {
        'peer-dev': '{"wrap":"peer"}',
        'sender-dev': '{"wrap":"sender"}',
      },
    });

    const store = createTestStore({
      auth: {
        user: { ...defaultMockUser, emailVerified: true },
        accessToken: 'test-token',
      },
      devicePublicKeys: {
        byUserId: {
          'peer-1': freshDeviceKeysEntry([
            { deviceId: 'peer-dev', publicKey: 'spki-peer' },
          ]),
          me: freshDeviceKeysEntry([
            { deviceId: 'sender-dev', publicKey: 'spki-sender' },
          ]),
        },
      },
    });

    const { result } = renderHook(
      () => useSendEncryptedMessage({ peerUserId: 'peer-1' }),
      { wrapper: hookWrapper(store) },
    );

    await result.current.sendMessage({
      body: 'Hello',
      recipientUserId: 'peer-1',
    });

    expect(ensureUserKeypairReadyForMessaging).toHaveBeenCalledWith(
      defaultMockUser.id,
      expect.any(Function),
    );
    expect(encryptUtf8ToHybridSendPayload).toHaveBeenCalledWith(
      'Hello',
      expect.arrayContaining([
        expect.objectContaining({ deviceId: 'peer-dev', publicKey: 'spki-peer' }),
        expect.objectContaining({
          deviceId: 'sender-dev',
          publicKey: 'spki-sender',
        }),
      ]),
    );
    expect(socketSend).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'cipher-b64-mock',
        iv: 'iv-b64-mock',
        algorithm: MESSAGE_HYBRID_ALGORITHM,
        encryptedMessageKeys: {
          'peer-dev': '{"wrap":"peer"}',
          'sender-dev': '{"wrap":"sender"}',
        },
        recipientUserId: 'peer-1',
      }),
    );
  });

  it('encrypts hybrid payload for every cached sender directory device (not filtered to crypto.deviceId)', async () => {
    encryptUtf8ToHybridSendPayload.mockResolvedValue({
      algorithm: MESSAGE_HYBRID_ALGORITHM,
      body: 'cipher-b64-mock',
      iv: 'iv-b64-mock',
      encryptedMessageKeys: {
        'peer-dev': '{}',
        'sender-a': '{}',
        'sender-b': '{}',
      },
    });

    const store = createTestStore({
      auth: {
        user: { ...defaultMockUser, emailVerified: true },
        accessToken: 'test-token',
      },
      crypto: {
        registeredOnServer: true,
        keyVersion: 1,
        deviceId: 'sender-a',
        registeredPublicKeySpki: 'spki-a',
        lastUpdatedAt: '2026-01-01T00:00:00.000Z',
        status: 'succeeded',
        error: null,
        syncState: 'idle',
        pendingSyncFromDeviceId: null,
        pendingSyncFromDevicePublicKey: null,
        syncCompletedForNewDeviceId: null,
      },
      devicePublicKeys: {
        byUserId: {
          'peer-1': freshDeviceKeysEntry([
            { deviceId: 'peer-dev', publicKey: 'spki-peer' },
          ]),
          me: freshDeviceKeysEntry([
            { deviceId: 'sender-a', publicKey: 'spki-a' },
            { deviceId: 'sender-b', publicKey: 'spki-b' },
          ]),
        },
      },
    });

    const { result } = renderHook(
      () => useSendEncryptedMessage({ peerUserId: 'peer-1' }),
      { wrapper: hookWrapper(store) },
    );

    await result.current.sendMessage({
      body: 'Hello',
      recipientUserId: 'peer-1',
    });

    expect(encryptUtf8ToHybridSendPayload).toHaveBeenCalledWith(
      'Hello',
      expect.arrayContaining([
        expect.objectContaining({ deviceId: 'peer-dev', publicKey: 'spki-peer' }),
        expect.objectContaining({ deviceId: 'sender-a', publicKey: 'spki-a' }),
        expect.objectContaining({ deviceId: 'sender-b', publicKey: 'spki-b' }),
      ]),
    );
    expect(encryptUtf8ToHybridSendPayload.mock.calls[0]?.[1]).toHaveLength(3);
  });

  it('sends hybrid fields when using conversationId + peerUserId option', async () => {
    encryptUtf8ToHybridSendPayload.mockResolvedValue({
      algorithm: MESSAGE_HYBRID_ALGORITHM,
      body: 'cipher-b64-mock',
      iv: 'iv-b64-mock',
      encryptedMessageKeys: {
        'peer-dev': '{"wrap":"peer"}',
        'sender-dev': '{"wrap":"sender"}',
      },
    });

    const store = createTestStore({
      auth: {
        user: { ...defaultMockUser, emailVerified: true },
        accessToken: 'test-token',
      },
      devicePublicKeys: {
        byUserId: {
          'peer-1': freshDeviceKeysEntry([
            { deviceId: 'peer-dev', publicKey: 'spki-peer' },
          ]),
          me: freshDeviceKeysEntry([
            { deviceId: 'sender-dev', publicKey: 'spki-sender' },
          ]),
        },
      },
    });

    const { result } = renderHook(
      () => useSendEncryptedMessage({ peerUserId: 'peer-1' }),
      { wrapper: hookWrapper(store) },
    );

    await result.current.sendMessage({
      conversationId: 'conv-1',
      body: 'Hello hybrid',
    });

    expect(encryptUtf8ToHybridSendPayload).toHaveBeenCalledWith(
      'Hello hybrid',
      expect.any(Array),
    );
    expect(socketSend).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 'conv-1',
        body: 'cipher-b64-mock',
        iv: 'iv-b64-mock',
        algorithm: MESSAGE_HYBRID_ALGORITHM,
        encryptedMessageKeys: {
          'peer-dev': '{"wrap":"peer"}',
          'sender-dev': '{"wrap":"sender"}',
        },
      }),
    );
  });

  it('throws when the peer has no device rows after fetch cache', async () => {
    const store = createTestStore({
      auth: {
        user: { ...defaultMockUser, emailVerified: true },
        accessToken: 'test-token',
      },
      devicePublicKeys: {
        byUserId: {
          'peer-1': freshDeviceKeysEntry([]),
          me: freshDeviceKeysEntry([{ deviceId: 'sender-dev', publicKey: 'spki' }]),
        },
      },
    });

    const { result } = renderHook(
      () => useSendEncryptedMessage({ peerUserId: 'peer-1' }),
      { wrapper: hookWrapper(store) },
    );

    await expect(
      result.current.sendMessage({ body: 'x', recipientUserId: 'peer-1' }),
    ).rejects.toThrow(RECIPIENT_NO_HYBRID_DEVICE_KEYS_MESSAGE);
    expect(encryptUtf8ToHybridSendPayload).not.toHaveBeenCalled();
  });

  it('throws when the signed-in user has no device rows', async () => {
    const store = createTestStore({
      auth: {
        user: { ...defaultMockUser, emailVerified: true },
        accessToken: 'test-token',
      },
      devicePublicKeys: {
        byUserId: {
          'peer-1': freshDeviceKeysEntry([
            { deviceId: 'peer-dev', publicKey: 'spki-peer' },
          ]),
          me: freshDeviceKeysEntry([]),
        },
      },
    });

    const { result } = renderHook(
      () => useSendEncryptedMessage({ peerUserId: 'peer-1' }),
      { wrapper: hookWrapper(store) },
    );

    await expect(
      result.current.sendMessage({ body: 'x', recipientUserId: 'peer-1' }),
    ).rejects.toThrow(SENDER_NO_HYBRID_DEVICE_KEYS_MESSAGE);
    expect(encryptUtf8ToHybridSendPayload).not.toHaveBeenCalled();
  });

  it('RTL: successful send does not surface hybrid no-device errors', async () => {
    const user = userEvent.setup();

    encryptUtf8ToHybridSendPayload.mockResolvedValue({
      algorithm: MESSAGE_HYBRID_ALGORITHM,
      body: 'cipher-b64-mock',
      iv: 'iv-b64-mock',
      encryptedMessageKeys: { d: '{}' },
    });

    renderWithProviders(<SendHarness />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
        devicePublicKeys: {
          byUserId: {
            'peer-1': freshDeviceKeysEntry([
              { deviceId: 'peer-dev', publicKey: 'spki-peer' },
            ]),
            me: freshDeviceKeysEntry([
              { deviceId: 'sender-dev', publicKey: 'spki-sender' },
            ]),
          },
        },
      },
    });

    await user.click(screen.getByRole('button', { name: /send encrypted/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(RECIPIENT_NO_HYBRID_DEVICE_KEYS_MESSAGE)).not.toBeInTheDocument();
    expect(screen.queryByText(SENDER_NO_HYBRID_DEVICE_KEYS_MESSAGE)).not.toBeInTheDocument();
  });
});
