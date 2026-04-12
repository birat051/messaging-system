/**
 * P-256 **ECDH** long-term keypair for **ECIES** directory keys (`docs/USER_KEYPAIR_AND_E2EE_DESIGN.md` §3.1).
 * Uses **`SubtleCrypto`** only — no private key material leaves the client except via explicit export helpers for local storage.
 */

import { arrayBufferToBase64 } from './encoding';

const ECDH_P256: EcKeyGenParams = {
  name: 'ECDH',
  namedCurve: 'P-256',
};

/** Key usages for ECDH keypairs used in ECIES (derive shared secret bits). */
const ECDH_KEY_USAGES: KeyUsage[] = ['deriveBits'];

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available');
  }
  return subtle;
}

/**
 * Generate a new **P-256 ECDH** keypair suitable for registering **`publicKey`** (SPKI) with the server.
 * Call only in a **secure context** (HTTPS or localhost) after the user is authenticated.
 */
export async function generateP256EcdhKeyPair(): Promise<{
  publicKey: CryptoKey;
  privateKey: CryptoKey;
}> {
  const subtle = getSubtle();
  return subtle.generateKey(ECDH_P256, true, ECDH_KEY_USAGES);
}

/**
 * Export the **public** key as **SPKI DER** encoded with standard Base64 (matches **`PUT /users/me/public-key`**).
 */
export async function exportPublicKeySpkiBase64(
  publicKey: CryptoKey,
): Promise<string> {
  const subtle = getSubtle();
  const der = await subtle.exportKey('spki', publicKey);
  return arrayBufferToBase64(der);
}

/**
 * Export the **private** key as **PKCS#8 DER** Base64 for **local** persistence only (never send to the server).
 */
export async function exportPrivateKeyPkcs8Base64(
  privateKey: CryptoKey,
): Promise<string> {
  const subtle = getSubtle();
  const der = await subtle.exportKey('pkcs8', privateKey);
  return arrayBufferToBase64(der);
}

/**
 * Import PKCS#8 **P-256 ECDH** private key bytes (e.g. after restore from backup).
 */
export async function importP256EcdhPrivateKeyPkcs8(
  pkcs8Der: ArrayBuffer,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  return subtle.importKey('pkcs8', pkcs8Der, ECDH_P256, true, ECDH_KEY_USAGES);
}

/** Short **SHA-256** fingerprint (hex prefix) of the SPKI Base64 string for UX comparison. */
export async function fingerprintSpkiBase64(publicKeySpkiBase64: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await getSubtle().digest(
    'SHA-256',
    enc.encode(publicKeySpkiBase64.trim()),
  );
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < 8; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}
