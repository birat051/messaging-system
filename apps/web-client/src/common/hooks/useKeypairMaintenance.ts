import { useCallback } from 'react';
import { useAppDispatch } from '../../store/hooks';
import type { AppDispatch } from '../../store/store';
import { listUserDevicePublicKeys } from '../api/usersApi';
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
  DEFAULT_SINGLE_DEVICE_ID,
  getStoredDeviceId,
  migrateLegacyPrivateKeyToKeyring,
  setStoredDeviceId,
  storeKeyringPrivateKeyPkcs8,
} from '../crypto/privateKeyStorage';
import { assertSecureContextForPrivateKeyOps } from '../crypto/secureContext';
import { parseApiError } from '../../modules/auth/utils/apiError';
import { evaluateDeviceSyncBootstrapState } from '../crypto/deviceBootstrapSync';
import { registerDevice } from '../../modules/crypto/stores/cryptoSlice';
import { store } from '../../store/store';
import { useAuth } from './useAuth';

export async function rotateUserKeypairOnServer(
  dispatch: AppDispatch,
  userId: string,
  storagePassphrase: string,
): Promise<void> {
  assertSecureContextForPrivateKeyOps();
  let list: Awaited<ReturnType<typeof listUserDevicePublicKeys>>;
  try {
    list = await listUserDevicePublicKeys('me');
  } catch (e) {
    if (parseApiError(e).httpStatus === 404) {
      throw new Error(
        'No encryption key is registered on the server yet. Register a key before rotating.',
      );
    }
    throw e;
  }
  if (list.items.length === 0) {
    throw new Error(
      'No encryption key is registered on the server yet. Register a key before rotating.',
    );
  }
  const defaultRow = list.items.find((d) => d.deviceId === DEFAULT_SINGLE_DEVICE_ID);
  const migrationKeyVersion = defaultRow
    ? defaultRow.keyVersion
    : Math.max(...list.items.map((d) => d.keyVersion));
  await migrateLegacyPrivateKeyToKeyring(
    userId,
    migrationKeyVersion,
    storagePassphrase,
  );
  const pair = await generateP256EcdhKeyPair();
  const publicKeyB64 = await exportPublicKeySpkiBase64(pair.publicKey);
  const deviceId =
    (await getStoredDeviceId(userId)) ?? DEFAULT_SINGLE_DEVICE_ID;
  const result = await dispatch(
    registerDevice({ publicKey: publicKeyB64, deviceId }),
  ).unwrap();
  await setStoredDeviceId(userId, result.deviceId);
  const pkcs8B64 = await exportPrivateKeyPkcs8Base64(pair.privateKey);
  const pkcs8 = base64ToArrayBuffer(pkcs8B64);
  await storeKeyringPrivateKeyPkcs8(userId, result.keyVersion, pkcs8, storagePassphrase, {
    publicKeySpkiB64: result.publicKey,
  });
  await evaluateDeviceSyncBootstrapState(dispatch, result.deviceId, {
    getState: () => store.getState().crypto,
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
