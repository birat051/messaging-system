import { useCallback } from 'react';
import { importKeyringBackupFromArrayBuffer } from '../crypto/keyringBackup';
import { useAuth } from './useAuth';

/**
 * Restore **private key material** from an encrypted backup file on this device (**new browser** flow).
 * Writes keyring rows and, when the backup includes **`deviceId`**, persists it in **IndexedDB** next to the keyring
 * (same store as **`ensureUserKeypairReadyForMessaging`**). Same underlying import as **`useKeypairMaintenance`**
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

  const restorePrivateKeyFromBackup = useCallback(
    async (
      fileBytes: ArrayBuffer,
      backupPassphrase: string,
      storagePassphrase: string,
    ) => {
      if (!user?.id) {
        throw new Error('You must be signed in to restore a backup.');
      }
      return importKeyringBackupFromArrayBuffer(
        user.id,
        fileBytes,
        backupPassphrase,
        storagePassphrase,
      );
    },
    [user?.id],
  );

  return { restorePrivateKeyFromBackup };
}
