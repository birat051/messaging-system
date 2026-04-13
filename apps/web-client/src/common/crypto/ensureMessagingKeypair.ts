/**
 * **Automatic** sender keypair: generate, register on server, persist wrapped private key in the keyring.
 * No user-facing wizard — uses **`getOrCreateDeviceScopedPassphrase`** for local wrapping.
 * Concerns **only the signed-in user’s** key — recipient directory keys are handled by **`fetchRecipientPublicKeyForMessaging`** / **`prefetchRecipientPublicKey`**.
 */

import { uploadPublicKey } from '@/modules/crypto/stores/cryptoSlice';
import type { AppDispatch } from '@/store/store';
import { getUserPublicKeyById } from '../api/usersApi';
import { parseApiError } from '@/modules/auth/utils/apiError';
import {
  exportPrivateKeyPkcs8Base64,
  exportPublicKeySpkiBase64,
  generateP256EcdhKeyPair,
} from './keypair';
import { base64ToArrayBuffer } from './encoding';
import {
  getKeyringPublicSpkiOptional,
  listKeyringVersions,
  storeKeyringPrivateKeyPkcs8,
} from './privateKeyStorage';
import { assertSecureContextForPrivateKeyOps } from './secureContext';
import { getOrCreateDeviceScopedPassphrase } from './deviceMessagingPassphrase';

/**
 * Ensures the signed-in user has a **local** keyring row aligned with **`GET /users/{self}/public-key`**.
 * Call before sending E2EE payloads.
 */
export async function ensureUserKeypairReadyForMessaging(
  userId: string,
  dispatch: AppDispatch,
): Promise<void> {
  assertSecureContextForPrivateKeyOps();
  const passphrase = getOrCreateDeviceScopedPassphrase(userId);
  const versions = await listKeyringVersions(userId);

  if (versions.length > 0) {
    const maxV = Math.max(...versions);
    const localSpki = await getKeyringPublicSpkiOptional(userId, maxV);
    let server: Awaited<ReturnType<typeof getUserPublicKeyById>>;
    try {
      server = await getUserPublicKeyById(userId);
    } catch (e) {
      if (parseApiError(e).httpStatus === 404) {
        throw new Error(
          'Your device has a local encryption key but none is registered on the server.',
        );
      }
      throw e;
    }
    const a = localSpki?.trim() ?? '';
    const b = server.publicKey.trim();
    if (server.keyVersion !== maxV || a !== b) {
      throw new Error(
        'Your local encryption key does not match the server. Restore from a backup on this device.',
      );
    }
    return;
  }

  let server: Awaited<ReturnType<typeof getUserPublicKeyById>> | null = null;
  try {
    server = await getUserPublicKeyById(userId);
  } catch (e) {
    if (parseApiError(e).httpStatus !== 404) {
      throw e;
    }
  }

  if (server !== null) {
    throw new Error(
      'An encryption key is registered for this account, but this browser has no key material. Restore from a backup.',
    );
  }

  const pair = await generateP256EcdhKeyPair();
  const publicKeyB64 = await exportPublicKeySpkiBase64(pair.publicKey);
  const result = await dispatch(
    uploadPublicKey({ publicKey: publicKeyB64 }),
  ).unwrap();
  const pkcs8B64 = await exportPrivateKeyPkcs8Base64(pair.privateKey);
  const pkcs8 = base64ToArrayBuffer(pkcs8B64);
  await storeKeyringPrivateKeyPkcs8(userId, result.keyVersion, pkcs8, passphrase, {
    publicKeySpkiB64: result.publicKey,
  });
}
