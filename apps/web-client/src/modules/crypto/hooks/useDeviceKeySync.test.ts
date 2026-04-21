import { configureStore } from '@reduxjs/toolkit';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as authApi from '@/common/api/authApi';
import * as usersApi from '@/common/api/usersApi';
import { defaultMockUser } from '@/common/mocks/handlers';
import { applyAuthResponse } from '@/modules/auth/utils/applyAuthResponse';
import {
  cryptoReducer,
  syncCompleted,
  syncRequested,
} from '@/modules/crypto/stores/cryptoSlice';
import { loadMessagingEcdhPrivateKey } from '@/common/crypto/loadMessagingEcdhPrivateKey';
import * as messageKeyCrypto from '@/common/crypto/messageKeyCrypto';
import { executeApproveDeviceKeySync } from './useDeviceKeySync';

vi.mock('@/common/api/usersApi');
vi.mock('@/common/api/authApi');
vi.mock('@/common/crypto/loadMessagingEcdhPrivateKey');
vi.mock('@/modules/auth/utils/applyAuthResponse');
vi.mock('@/modules/auth/utils/authStorage', () => ({
  readRefreshToken: vi.fn(() => 'refresh-token'),
}));
vi.mock('@/common/crypto/messageKeyCrypto', () => ({
  unwrapMessageKey: vi.fn(),
  wrapMessageKey: vi.fn(),
}));

/** If this object ever appeared in **`postBatchSyncMessageKeys`** JSON, the leak assertion would fail. */
const sentinelPrivateKey = {
  __LOCAL_ECDH_PRIVATE_SENTINEL__: true,
} as unknown as CryptoKey;

/** Every **`postBatchSyncMessageKeys`** body must be JSON-serializable wrapped keys only (checklist: no private key on wire). */
function assertPostBatchSyncBodiesHaveNoPrivateKeyLeaks(): void {
  const calls = vi.mocked(usersApi.postBatchSyncMessageKeys).mock.calls;
  expect(calls.length).toBeGreaterThan(0);

  for (const [body] of calls) {
    expect(body).toEqual(
      expect.objectContaining({
        targetDeviceId: expect.any(String),
        keys: expect.any(Array),
      }),
    );
    const b = body as {
      targetDeviceId: string;
      keys: Array<Record<string, unknown>>;
    };
    const wire = JSON.stringify(b);
    expect(wire).not.toContain('__LOCAL_ECDH_PRIVATE_SENTINEL__');
    expect(wire).not.toMatch(/BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY/i);
    expect(wire).not.toMatch(/"type":"private"/);

    for (const row of b.keys) {
      expect(Object.keys(row).sort()).toEqual(
        ['encryptedMessageKey', 'messageId'].sort(),
      );
      expect(typeof row.messageId).toBe('string');
      expect(typeof row.encryptedMessageKey).toBe('string');
    }
  }
}

/** No mocked **`usersApi`** request arguments may serialize the local **`CryptoKey`** sentinel (private key stays off the wire). */
function assertNoMockedUsersApiCallLeaksPrivateKeySentinel(): void {
  const fns = [
    usersApi.postBatchSyncMessageKeys,
    usersApi.listMySyncMessageKeys,
    usersApi.listMyDevices,
  ] as const;
  for (const fn of fns) {
    for (const args of vi.mocked(fn).mock.calls) {
      expect(JSON.stringify(args)).not.toContain('__LOCAL_ECDH_PRIVATE_SENTINEL__');
    }
  }
}

function expectStoreDispatchedSyncCompleted(
  dispatchSpy: ReturnType<typeof vi.spyOn>,
  newDeviceId: string,
): void {
  const hit = dispatchSpy.mock.calls.some(
    (call) =>
      call[0] !== null &&
      typeof call[0] === 'object' &&
      'type' in call[0] &&
      (call[0] as { type: string }).type === syncCompleted.type &&
      'payload' in call[0] &&
      (call[0] as { payload: { newDeviceId: string } }).payload.newDeviceId ===
        newDeviceId,
  );
  expect(hit).toBe(true);
}

/**
 * **`executeApproveDeviceKeySync`** (trusted-device key sync): mocked **`listMySyncMessageKeys`** pagination,
 * **`unwrapMessageKey`** / **`wrapMessageKey`**, **`postBatchSyncMessageKeys`** bodies, **`syncCompleted`** dispatch,
 * and wire leak checks (no PKCS8 / **`CryptoKey`** sentinel on the network).
 */
describe('executeApproveDeviceKeySync', () => {
  beforeEach(() => {
    vi.mocked(usersApi.listMyDevices).mockReset();
    vi.mocked(usersApi.listMySyncMessageKeys).mockReset();
    vi.mocked(usersApi.postBatchSyncMessageKeys).mockReset();
    vi.mocked(authApi.refreshTokens).mockReset();
    vi.mocked(loadMessagingEcdhPrivateKey).mockReset();
    vi.mocked(applyAuthResponse).mockReset();
    vi.mocked(messageKeyCrypto.unwrapMessageKey).mockReset();
    vi.mocked(messageKeyCrypto.wrapMessageKey).mockReset();
  });

  it('rejects when the new device is not on GET /users/me/devices or SPKI mismatches', async () => {
    vi.mocked(usersApi.listMyDevices).mockResolvedValue({
      items: [
        {
          deviceId: 'other',
          publicKey: 'pk-other',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const store = configureStore({ reducer: { crypto: cryptoReducer } });

    await expect(
      executeApproveDeviceKeySync({
        dispatch: store.dispatch,
        authUser: defaultMockUser,
        sourceDeviceId: 'src-dev',
        payload: { newDeviceId: 'new-dev', newDevicePublicKey: 'expected-pk' },
      }),
    ).rejects.toThrow(/not listed|public key/i);

    expect(usersApi.postBatchSyncMessageKeys).not.toHaveBeenCalled();
  });

  it('refreshes with sourceDeviceId, re-wraps keys locally, POSTs only wrapped keys, then clears the request', async () => {
    vi.mocked(usersApi.listMyDevices).mockResolvedValue({
      items: [
        {
          deviceId: 'new-dev',
          publicKey: 'expected-pk',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(loadMessagingEcdhPrivateKey).mockResolvedValue(sentinelPrivateKey);
    vi.mocked(authApi.refreshTokens).mockResolvedValue({
      accessToken: 'access-with-sdi',
      refreshToken: 'next-rt',
      expiresAt: null,
      tokenType: 'Bearer',
    });
    vi.mocked(usersApi.listMySyncMessageKeys).mockResolvedValueOnce({
      items: [
        {
          messageId: 'msg-1',
          encryptedMessageKey: 'wrapped-for-src',
        },
      ],
      hasMore: false,
      nextAfterMessageId: null,
    });
    const rawKey = new Uint8Array(32);
    rawKey.fill(9);
    vi.mocked(messageKeyCrypto.unwrapMessageKey).mockResolvedValue(rawKey);
    vi.mocked(messageKeyCrypto.wrapMessageKey).mockResolvedValue('wrapped-for-new');
    vi.mocked(usersApi.postBatchSyncMessageKeys).mockResolvedValue({
      applied: 1,
      skipped: 0,
    });

    const store = configureStore({ reducer: { crypto: cryptoReducer } });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    store.dispatch(
      syncRequested({
        newDeviceId: 'new-dev',
        newDevicePublicKey: 'expected-pk',
      }),
    );
    expect(store.getState().crypto.pendingSyncFromDeviceId).toBe('new-dev');

    await executeApproveDeviceKeySync({
      dispatch: store.dispatch,
      authUser: defaultMockUser,
      sourceDeviceId: 'src-dev',
      payload: { newDeviceId: 'new-dev', newDevicePublicKey: 'expected-pk' },
    });

    expect(authApi.refreshTokens).toHaveBeenCalledWith({
      refreshToken: 'refresh-token',
      sourceDeviceId: 'src-dev',
    });
    expect(applyAuthResponse).toHaveBeenCalledWith(
      store.dispatch,
      expect.objectContaining({ accessToken: 'access-with-sdi' }),
      defaultMockUser,
    );
    expect(messageKeyCrypto.unwrapMessageKey).toHaveBeenCalledWith(
      'wrapped-for-src',
      sentinelPrivateKey,
    );
    expect(messageKeyCrypto.wrapMessageKey).toHaveBeenCalledWith(rawKey, 'expected-pk');
    expect(usersApi.postBatchSyncMessageKeys).toHaveBeenCalledWith({
      targetDeviceId: 'new-dev',
      keys: [{ messageId: 'msg-1', encryptedMessageKey: 'wrapped-for-new' }],
    });
    expect(store.getState().crypto.pendingSyncFromDeviceId).toBeNull();
    expect(store.getState().crypto.pendingSyncFromDevicePublicKey).toBeNull();
    expect(store.getState().crypto.syncCompletedForNewDeviceId).toBe('new-dev');
    expectStoreDispatchedSyncCompleted(dispatchSpy, 'new-dev');
    expect(usersApi.listMySyncMessageKeys.mock.calls[0]?.[0]).toMatchObject({
      deviceId: 'src-dev',
      limit: 100,
    });
    assertPostBatchSyncBodiesHaveNoPrivateKeyLeaks();
    assertNoMockedUsersApiCallLeaksPrivateKeySentinel();
    dispatchSpy.mockRestore();
  });

  it('for each sync entry unwraps with my private key then wraps for new device SPKI (accumulates keys for POST)', async () => {
    vi.mocked(usersApi.listMyDevices).mockResolvedValue({
      items: [
        {
          deviceId: 'new-dev',
          publicKey: 'expected-pk',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(loadMessagingEcdhPrivateKey).mockResolvedValue(sentinelPrivateKey);
    vi.mocked(authApi.refreshTokens).mockResolvedValue({
      accessToken: 'access-with-sdi',
      refreshToken: 'next-rt',
      expiresAt: null,
      tokenType: 'Bearer',
    });
    vi.mocked(usersApi.listMySyncMessageKeys).mockResolvedValueOnce({
      items: [
        { messageId: 'msg-a', encryptedMessageKey: 'enc-a' },
        { messageId: 'msg-b', encryptedMessageKey: 'enc-b' },
      ],
      hasMore: false,
      nextAfterMessageId: null,
    });
    const keyA = new Uint8Array(32);
    keyA.fill(1);
    const keyB = new Uint8Array(32);
    keyB.fill(2);
    vi.mocked(messageKeyCrypto.unwrapMessageKey).mockImplementation(async (enc: string) => {
      if (enc === 'enc-a') {
        return keyA;
      }
      if (enc === 'enc-b') {
        return keyB;
      }
      throw new Error('unexpected enc');
    });
    vi.mocked(messageKeyCrypto.wrapMessageKey).mockImplementation(async (mk: Uint8Array) => {
      if (mk === keyA) {
        return 'new-enc-a';
      }
      if (mk === keyB) {
        return 'new-enc-b';
      }
      return 'other';
    });
    vi.mocked(usersApi.postBatchSyncMessageKeys).mockResolvedValue({
      applied: 2,
      skipped: 0,
    });

    const store = configureStore({ reducer: { crypto: cryptoReducer } });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    await executeApproveDeviceKeySync({
      dispatch: store.dispatch,
      authUser: defaultMockUser,
      sourceDeviceId: 'src-dev',
      payload: { newDeviceId: 'new-dev', newDevicePublicKey: 'expected-pk' },
    });

    expect(messageKeyCrypto.unwrapMessageKey).toHaveBeenCalledWith('enc-a', sentinelPrivateKey);
    expect(messageKeyCrypto.unwrapMessageKey).toHaveBeenCalledWith('enc-b', sentinelPrivateKey);
    expect(messageKeyCrypto.wrapMessageKey).toHaveBeenCalledWith(keyA, 'expected-pk');
    expect(messageKeyCrypto.wrapMessageKey).toHaveBeenCalledWith(keyB, 'expected-pk');
    expect(usersApi.postBatchSyncMessageKeys).toHaveBeenCalledWith({
      targetDeviceId: 'new-dev',
      keys: [
        { messageId: 'msg-a', encryptedMessageKey: 'new-enc-a' },
        { messageId: 'msg-b', encryptedMessageKey: 'new-enc-b' },
      ],
    });
    expect(store.getState().crypto.syncCompletedForNewDeviceId).toBe('new-dev');
    expectStoreDispatchedSyncCompleted(dispatchSpy, 'new-dev');
    assertPostBatchSyncBodiesHaveNoPrivateKeyLeaks();
    assertNoMockedUsersApiCallLeaksPrivateKeySentinel();
    dispatchSpy.mockRestore();
  });

  it('paginates GET /users/me/sync/message-keys using afterMessageId until hasMore is false', async () => {
    vi.mocked(usersApi.listMyDevices).mockResolvedValue({
      items: [
        {
          deviceId: 'new-dev',
          publicKey: 'expected-pk',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(loadMessagingEcdhPrivateKey).mockResolvedValue(sentinelPrivateKey);
    vi.mocked(authApi.refreshTokens).mockResolvedValue({
      accessToken: 'access-with-sdi',
      refreshToken: 'next-rt',
      expiresAt: null,
      tokenType: 'Bearer',
    });
    vi.mocked(usersApi.listMySyncMessageKeys)
      .mockResolvedValueOnce({
        items: [{ messageId: 'm1', encryptedMessageKey: 'w1' }],
        hasMore: true,
        nextAfterMessageId: 'm1',
      })
      .mockResolvedValueOnce({
        items: [{ messageId: 'm2', encryptedMessageKey: 'w2' }],
        hasMore: false,
        nextAfterMessageId: null,
      });
    vi.mocked(messageKeyCrypto.unwrapMessageKey).mockResolvedValue(
      new Uint8Array(32).fill(1),
    );
    vi.mocked(messageKeyCrypto.wrapMessageKey).mockResolvedValue('wrapped');
    vi.mocked(usersApi.postBatchSyncMessageKeys).mockResolvedValue({
      applied: 1,
      skipped: 0,
    });

    const store = configureStore({ reducer: { crypto: cryptoReducer } });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    await executeApproveDeviceKeySync({
      dispatch: store.dispatch,
      authUser: defaultMockUser,
      sourceDeviceId: 'src-dev',
      payload: { newDeviceId: 'new-dev', newDevicePublicKey: 'expected-pk' },
    });

    expect(usersApi.listMySyncMessageKeys).toHaveBeenCalledTimes(2);
    expect(usersApi.listMySyncMessageKeys.mock.calls[0]?.[0]).toMatchObject({
      deviceId: 'src-dev',
      limit: 100,
    });
    expect(usersApi.listMySyncMessageKeys.mock.calls[1]?.[0]).toMatchObject({
      deviceId: 'src-dev',
      afterMessageId: 'm1',
      limit: 100,
    });
    expect(usersApi.postBatchSyncMessageKeys).toHaveBeenCalledTimes(2);
    expect(vi.mocked(usersApi.postBatchSyncMessageKeys).mock.calls[0]?.[0]).toEqual({
      targetDeviceId: 'new-dev',
      keys: [{ messageId: 'm1', encryptedMessageKey: 'wrapped' }],
    });
    expect(vi.mocked(usersApi.postBatchSyncMessageKeys).mock.calls[1]?.[0]).toEqual({
      targetDeviceId: 'new-dev',
      keys: [{ messageId: 'm2', encryptedMessageKey: 'wrapped' }],
    });
    expect(store.getState().crypto.syncCompletedForNewDeviceId).toBe('new-dev');
    expectStoreDispatchedSyncCompleted(dispatchSpy, 'new-dev');
    expect(messageKeyCrypto.unwrapMessageKey).toHaveBeenNthCalledWith(
      1,
      'w1',
      sentinelPrivateKey,
    );
    expect(messageKeyCrypto.unwrapMessageKey).toHaveBeenNthCalledWith(
      2,
      'w2',
      sentinelPrivateKey,
    );
    expect(messageKeyCrypto.wrapMessageKey).toHaveBeenNthCalledWith(
      1,
      expect.any(Uint8Array),
      'expected-pk',
    );
    expect(messageKeyCrypto.wrapMessageKey).toHaveBeenNthCalledWith(
      2,
      expect.any(Uint8Array),
      'expected-pk',
    );
    assertPostBatchSyncBodiesHaveNoPrivateKeyLeaks();
    assertNoMockedUsersApiCallLeaksPrivateKeySentinel();
    dispatchSpy.mockRestore();
  });

  it('honors syncMessageKeysPageLimit override (capped by server max)', async () => {
    vi.mocked(usersApi.listMyDevices).mockResolvedValue({
      items: [
        {
          deviceId: 'new-dev',
          publicKey: 'expected-pk',
          deviceLabel: null,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastSeenAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    });
    vi.mocked(loadMessagingEcdhPrivateKey).mockResolvedValue(sentinelPrivateKey);
    vi.mocked(authApi.refreshTokens).mockResolvedValue({
      accessToken: 'access-with-sdi',
      refreshToken: 'next-rt',
      expiresAt: null,
      tokenType: 'Bearer',
    });
    vi.mocked(usersApi.listMySyncMessageKeys).mockResolvedValue({
      items: [],
      hasMore: false,
      nextAfterMessageId: null,
    });

    const store = configureStore({ reducer: { crypto: cryptoReducer } });
    const dispatchSpy = vi.spyOn(store, 'dispatch');
    await executeApproveDeviceKeySync({
      dispatch: store.dispatch,
      authUser: defaultMockUser,
      sourceDeviceId: 'src-dev',
      payload: { newDeviceId: 'new-dev', newDevicePublicKey: 'expected-pk' },
      syncMessageKeysPageLimit: 37,
    });

    expect(usersApi.listMySyncMessageKeys.mock.calls[0]?.[0]).toMatchObject({
      deviceId: 'src-dev',
      limit: 37,
    });
    expect(store.getState().crypto.syncCompletedForNewDeviceId).toBe('new-dev');
    expectStoreDispatchedSyncCompleted(dispatchSpy, 'new-dev');
    assertNoMockedUsersApiCallLeaksPrivateKeySentinel();
    dispatchSpy.mockRestore();
  });
});
