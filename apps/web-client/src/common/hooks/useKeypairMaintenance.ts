import { useCallback } from 'react';
import { useAppDispatch } from '../../store/hooks';
import type { AppDispatch } from '../../store/store';
import { getUserPublicKeyById } from '../api/usersApi';
import {
  buildKeyringBackupBlob,
  importKeyringBackupFromArrayBuffer,
} from '../crypto/keyringBackup';
import { base64ToArrayBuffer } from '../crypto/encoding';
import {
  generateP256EcdhKeyPair,
  exportPrivateKeyPkcs8Base64,
  exportPublicKeySpkiBase64,
} from '../crypto/keypair';
import {
  migrateLegacyPrivateKeyToKeyring,
  storeKeyringPrivateKeyPkcs8,
} from '../crypto/privateKeyStorage';
import { assertSecureContextForPrivateKeyOps } from '../crypto/secureContext';
import { parseApiError } from '../../modules/auth/utils/apiError';
import { rotatePublicKey } from '../../modules/crypto/stores/cryptoSlice';
import { useAuth } from './useAuth';

export async function rotateUserKeypairOnServer(
  dispatch: AppDispatch,
  userId: string,
  storagePassphrase: string,
): Promise<void> {
  assertSecureContextForPrivateKeyOps();
  let server: Awaited<ReturnType<typeof getUserPublicKeyById>>;
  try {
    server = await getUserPublicKeyById(userId);
  } catch (e) {
    if (parseApiError(e).httpStatus === 404) {
      throw new Error(
        'No encryption key is registered on the server yet. Register a key before rotating.',
      );
    }
    throw e;
  }
  await migrateLegacyPrivateKeyToKeyring(
    userId,
    server.keyVersion,
    storagePassphrase,
  );
  const pair = await generateP256EcdhKeyPair();
  const publicKeyB64 = await exportPublicKeySpkiBase64(pair.publicKey);
  const result = await dispatch(
    rotatePublicKey({ publicKey: publicKeyB64 }),
  ).unwrap();
  const pkcs8B64 = await exportPrivateKeyPkcs8Base64(pair.privateKey);
  const pkcs8 = base64ToArrayBuffer(pkcs8B64);
  await storeKeyringPrivateKeyPkcs8(userId, result.keyVersion, pkcs8, storagePassphrase, {
    publicKeySpkiB64: result.publicKey,
  });
}

/**
 * Backup, restore, and rotate flows (**Option A** retains prior keyring entries; **`rotateUserKeypairOnServer`**).
 */
export function useKeypairMaintenance(): {
  rotateKeypair: (storagePassphrase: string) => Promise<void>;
  exportBackup: (
    storagePassphrase: string,
    backupPassphrase: string,
    serverKeyVersionFallback: number,
  ) => Promise<{ blob: Blob; filename: string }>;
  importBackup: (
    fileBytes: ArrayBuffer,
    backupPassphrase: string,
    storagePassphrase: string,
  ) => Promise<{ importedVersions: number[] }>;
} {
  const dispatch = useAppDispatch();
  const { user } = useAuth();

  const rotateKeypair = useCallback(
    async (storagePassphrase: string) => {
      if (!user?.id) {
        throw new Error('You must be signed in to rotate your key.');
      }
      await rotateUserKeypairOnServer(dispatch, user.id, storagePassphrase);
    },
    [dispatch, user?.id],
  );

  const exportBackup = useCallback(
    async (
      storagePassphrase: string,
      backupPassphrase: string,
      serverKeyVersionFallback: number,
    ) => {
      if (!user?.id) {
        throw new Error('You must be signed in to export a backup.');
      }
      return buildKeyringBackupBlob(
        user.id,
        storagePassphrase,
        backupPassphrase,
        serverKeyVersionFallback,
      );
    },
    [user?.id],
  );

  const importBackup = useCallback(
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

  return {
    rotateKeypair,
    exportBackup,
    importBackup,
  };
}
