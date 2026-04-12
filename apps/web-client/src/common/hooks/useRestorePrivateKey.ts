import { useCallback } from 'react';
import { importKeyringBackupFromArrayBuffer } from '../crypto/keyringBackup';
import { useAuth } from './useAuth';

/**
 * Restore **private key material** from an encrypted backup file on this device (**new browser** flow).
 * Same underlying import as **`useKeypairMaintenance`**’s **`importBackup`** — split for clearer call sites.
 */
export function useRestorePrivateKey(): {
  restorePrivateKeyFromBackup: (
    fileBytes: ArrayBuffer,
    backupPassphrase: string,
    storagePassphrase: string,
  ) => Promise<{ importedVersions: number[] }>;
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
