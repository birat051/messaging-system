import { useCallback } from 'react';
import { importKeyringBackupFromArrayBuffer } from '../crypto/keyringBackup';
import { hydrateMessagingDeviceId } from '../../modules/crypto/stores/cryptoSlice';
import { useAppDispatch } from '../../store/hooks';
import { useAuth } from './useAuth';

/**
 * Restore **private key material** from an encrypted backup file on this device (**new browser** flow).
 * Writes keyring rows; when the backup includes **`deviceId`**, persists it via **`setStoredDeviceId`** (**IndexedDB**
 * **`deviceIdentity`**) and mirrors it into Redux (**`hydrateMessagingDeviceId`**) so **`crypto.deviceId`** matches
 * **IndexedDB** before **`POST /users/me/devices`** / **`useKeypairStatus`**. Same crypto path as **`useKeypairMaintenance`**
 * **`importBackup`** — split for clearer call sites.
 */
export function useRestorePrivateKey(): {
  restorePrivateKeyFromBackup: (
    fileBytes: ArrayBuffer,
    backupPassphrase: string,
    storagePassphrase: string,
  ) => Promise<{ importedVersions: number[]; deviceId: string | null }>;
} {
  const { user } = useAuth();
  const dispatch = useAppDispatch();

  const restorePrivateKeyFromBackup = useCallback(
    async (
      fileBytes: ArrayBuffer,
      backupPassphrase: string,
      storagePassphrase: string,
    ) => {
      if (!user?.id) {
        throw new Error('You must be signed in to restore a backup.');
      }
      const result = await importKeyringBackupFromArrayBuffer(
        user.id,
        fileBytes,
        backupPassphrase,
        storagePassphrase,
      );
      if (result.deviceId) {
        dispatch(hydrateMessagingDeviceId(result.deviceId));
      }
      return result;
    },
    [dispatch, user?.id],
  );

  return { restorePrivateKeyFromBackup };
}
