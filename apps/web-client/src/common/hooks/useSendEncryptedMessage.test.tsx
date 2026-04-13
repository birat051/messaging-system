import { renderHook, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState, type ReactNode } from 'react';
import { Provider } from 'react-redux';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/generated/api-types';
import { defaultMockUser } from '@/common/mocks/handlers';
import { createTestStore, renderWithProviders } from '@/common/test-utils';
import { mockSendMessageSocketLike } from '@/common/test-utils/mockSendMessageForVitest';
import { RECIPIENT_NO_KEY_AVAILABLE_MESSAGE } from '@/common/utils/fetchRecipientPublicKey';
import { useSendEncryptedMessage } from './useSendEncryptedMessage';

const ensureUserKeypairReadyForMessaging = vi.hoisted(() =>
  vi.fn().mockResolvedValue(undefined),
);

vi.mock('../crypto/ensureMessagingKeypair', () => ({
  ensureUserKeypairReadyForMessaging: (
    userId: string,
    dispatch: unknown,
  ) => ensureUserKeypairReadyForMessaging(userId, dispatch),
}));

const fetchRecipientPublicKeyWithCache = vi.hoisted(() => {
  const key: components['schemas']['UserPublicKeyResponse'] = {
    userId: 'peer-1',
    publicKey:
      'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEeWtZ0jiCzy6i7c1fhDNcct9WUer1FC9027TeJwYmimeYcCDeAauszT90CsuigDh12qwCJ3yFUDcZurT22BWJrJA',
    keyVersion: 1,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
  return vi.fn().mockResolvedValue(key);
});

vi.mock('../utils/fetchRecipientPublicKey', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../utils/fetchRecipientPublicKey')>();
  return {
    ...actual,
    fetchRecipientPublicKeyWithCache: (
      recipientUserId: string,
      getState: () => unknown,
      dispatch: unknown,
    ) => fetchRecipientPublicKeyWithCache(recipientUserId, getState, dispatch),
  };
});

const encryptUtf8ToE2eeBody = vi.hoisted(() =>
  vi.fn().mockResolvedValue('e2ee-cipher-b64'),
);

vi.mock('../crypto/messageEcies', () => ({
  encryptUtf8ToE2eeBody: (plain: string, pk: string) =>
    encryptUtf8ToE2eeBody(plain, pk),
}));

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

/** Legacy copy removed from **`useSendEncryptedMessage`** — must never appear on success. */
const LEGACY_RECIPIENT_NO_KEY =
  /the recipient has not registered an encryption key yet/i;

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
    fetchRecipientPublicKeyWithCache.mockClear();
    encryptUtf8ToE2eeBody.mockClear();
    socketSend.mockClear();
  });

  it('happy path: login (auth state) → sender key ensure → recipient key → encrypt → send', async () => {
    const store = createTestStore({
      auth: {
        user: { ...defaultMockUser, emailVerified: true },
        accessToken: 'test-token',
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
    expect(fetchRecipientPublicKeyWithCache).toHaveBeenCalledWith(
      'peer-1',
      expect.any(Function),
      expect.any(Function),
    );
    expect(encryptUtf8ToE2eeBody).toHaveBeenCalled();
    expect(socketSend).toHaveBeenCalledWith(
      expect.objectContaining({
        body: 'e2ee-cipher-b64',
        recipientUserId: 'peer-1',
      }),
    );
  });

  it('happy path (RTL): after send, UI does not show legacy or current recipient-no-key messages', async () => {
    const user = userEvent.setup();

    renderWithProviders(<SendHarness />, {
      preloadedState: {
        auth: {
          user: { ...defaultMockUser, emailVerified: true },
          accessToken: 'test-token',
        },
      },
    });

    await user.click(screen.getByRole('button', { name: /send encrypted/i }));

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(LEGACY_RECIPIENT_NO_KEY)).not.toBeInTheDocument();
    expect(
      screen.queryByText(RECIPIENT_NO_KEY_AVAILABLE_MESSAGE),
    ).not.toBeInTheDocument();
  });
});
