import { deleteMyDevice } from '../api/usersApi';
import { getStoredDeviceId } from '../crypto/privateKeyStorage';
import type { RootState } from '../../store/store';

function isRevokeOnLogoutEnabled(): boolean {
  return import.meta.env.VITE_REVOKE_DEVICE_ON_LOGOUT === 'true';
}

/**
 * When **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`**, calls **`DELETE /v1/users/me/devices/:deviceId`**
 * while the access token is still valid (before Redux **`logout`**).
 *
 * **IndexedDB** private keys and **`deviceIdentity`** are **not** cleared — the same browser can
 * re-register (**`POST /users/me/devices`**) on next login (**`ensureUserKeypairReadyForMessaging`**)
 * with the **same persisted `deviceId`**, restoring the registry row without changing **`encryptedMessageKeys`** lookups.
 */
export async function revokeCurrentDeviceOnServerBeforeLogout(
  getState: () => RootState,
): Promise<void> {
  if (!isRevokeOnLogoutEnabled()) {
    return;
  }

  const { auth, crypto } = getState();
  const userId = auth.user?.id;
  const token = auth.accessToken;
  if (!userId || !token) {
    return;
  }

  let deviceId = crypto.deviceId?.trim() ?? '';
  if (!deviceId) {
    try {
      const fromIdb = await getStoredDeviceId(userId);
      deviceId = fromIdb?.trim() ?? '';
    } catch {
      return;
    }
  }
  if (!deviceId) {
    return;
  }

  try {
    await deleteMyDevice(deviceId);
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[logout] optional device revoke failed (session still ends)', e);
    }
  }
}
