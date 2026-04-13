/**
 * Loads the signed-in user’s **P-256 ECDH** private key for **decrypting** inbound E2EE bodies.
 */

import { getOrCreateDeviceScopedPassphrase } from './deviceMessagingPassphrase';
import { importP256EcdhPrivateKeyPkcs8 } from './keypair';
import { loadEncryptedPrivateKeyPkcs8 } from './privateKeyStorage';
import { assertSecureContextForPrivateKeyOps } from './secureContext';

/**
 * Returns **`null`** when no key material exists on this device (same semantics as send path).
 */
export async function loadMessagingEcdhPrivateKey(
  userId: string,
): Promise<CryptoKey | null> {
  assertSecureContextForPrivateKeyOps();
  const passphrase = getOrCreateDeviceScopedPassphrase(userId);
  const pkcs8 = await loadEncryptedPrivateKeyPkcs8(userId, passphrase);
  if (!pkcs8) {
    return null;
  }
  return importP256EcdhPrivateKeyPkcs8(pkcs8);
}
