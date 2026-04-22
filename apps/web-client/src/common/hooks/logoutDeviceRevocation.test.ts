import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RootState } from '../../store/store';
import { revokeCurrentDeviceOnServerBeforeLogout } from './logoutDeviceRevocation';

vi.mock('../api/usersApi', () => ({
  deleteMyDevice: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../crypto/privateKeyStorage', () => ({
  getStoredDeviceId: vi.fn(),
}));

import { deleteMyDevice } from '../api/usersApi';
import { getStoredDeviceId } from '../crypto/privateKeyStorage';

function baseState(
  overrides: Partial<{
    userId: string | undefined;
    accessToken: string | null;
    /** When set (including **`null`**), overrides **`crypto.deviceId`**; omit for default **`dev-abc`**. */
    cryptoDeviceId: string | null;
  }> = {},
): RootState {
  const userId =
    'userId' in overrides ? overrides.userId : 'user-1';
  const cryptoDeviceId =
    'cryptoDeviceId' in overrides ? overrides.cryptoDeviceId : 'dev-abc';
  return {
    auth: {
      user: userId
        ? ({
            id: userId,
            email: 'a@b.c',
            guest: false,
          } as RootState['auth']['user'])
        : null,
      accessToken: overrides.accessToken ?? 'tok',
      accessTokenExpiresAt: null,
    },
    crypto: {
      registeredOnServer: true,
      keyVersion: 1,
      deviceId: cryptoDeviceId,
      registeredPublicKeySpki: 'pk',
      lastUpdatedAt: null,
      status: 'succeeded',
      error: null,
      syncState: 'idle',
      pendingSyncFromDeviceId: null,
      pendingSyncFromDevicePublicKey: null,
      syncCompletedForNewDeviceId: null,
    },
  } as unknown as RootState;
}

describe('revokeCurrentDeviceOnServerBeforeLogout', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.mocked(deleteMyDevice).mockClear();
    vi.mocked(getStoredDeviceId).mockReset();
  });

  it('does not call DELETE when VITE_REVOKE_DEVICE_ON_LOGOUT is not true', async () => {
    vi.stubEnv('VITE_REVOKE_DEVICE_ON_LOGOUT', undefined);
    await revokeCurrentDeviceOnServerBeforeLogout(() => baseState());
    expect(deleteMyDevice).not.toHaveBeenCalled();
  });

  it('calls deleteMyDevice when enabled and deviceId is in crypto state', async () => {
    vi.stubEnv('VITE_REVOKE_DEVICE_ON_LOGOUT', 'true');
    await revokeCurrentDeviceOnServerBeforeLogout(() =>
      baseState({ cryptoDeviceId: 'dev-xyz' }),
    );
    expect(deleteMyDevice).toHaveBeenCalledWith('dev-xyz');
  });

  it('resolves deviceId from IndexedDB when crypto.deviceId is empty', async () => {
    vi.stubEnv('VITE_REVOKE_DEVICE_ON_LOGOUT', 'true');
    vi.mocked(getStoredDeviceId).mockResolvedValue('from-idb');
    await revokeCurrentDeviceOnServerBeforeLogout(() =>
      baseState({ cryptoDeviceId: '' }),
    );
    expect(getStoredDeviceId).toHaveBeenCalledWith('user-1');
    expect(deleteMyDevice).toHaveBeenCalledWith('from-idb');
  });

  it('skips DELETE without user or access token', async () => {
    vi.stubEnv('VITE_REVOKE_DEVICE_ON_LOGOUT', 'true');
    await revokeCurrentDeviceOnServerBeforeLogout(() =>
      baseState({ userId: undefined, accessToken: null }),
    );
    expect(deleteMyDevice).not.toHaveBeenCalled();
  });
});
