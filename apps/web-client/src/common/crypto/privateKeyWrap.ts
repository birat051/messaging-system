/**
 * Passphrase-wrapped PKCS#8 using PBKDF2-HMAC-SHA256 + AES-256-GCM (no IndexedDB).
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';

const SALT_BYTES = 16;
const GCM_IV_BYTES = 12;

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available');
  }
  return subtle;
}

async function deriveAesGcmKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const enc = new TextEncoder();
  const passphraseBytes = enc.encode(passphrase);
  const keyMaterial = await subtle.importKey(
    'raw',
    passphraseBytes,
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256,
  );
  const keyBytes = new Uint8Array(bits);
  return subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

function uint8ToBase64(u8: Uint8Array): string {
  const buf = u8.buffer.slice(
    u8.byteOffset,
    u8.byteOffset + u8.byteLength,
  ) as ArrayBuffer;
  return arrayBufferToBase64(buf);
}

export type WrappedPrivateKeyPayload = {
  pbkdf2Iterations: number;
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
};

export async function wrapPrivateKeyPkcs8(
  pkcs8Der: ArrayBuffer,
  passphrase: string,
  iterations: number,
): Promise<WrappedPrivateKeyPayload> {
  const subtle = getSubtle();
  const salt = new Uint8Array(SALT_BYTES);
  crypto.getRandomValues(salt);
  const iv = new Uint8Array(GCM_IV_BYTES);
  crypto.getRandomValues(iv);

  const aesKey = await deriveAesGcmKeyFromPassphrase(passphrase, salt, iterations);
  const plaintext = new Uint8Array(pkcs8Der);
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    plaintext,
  );

  return {
    pbkdf2Iterations: iterations,
    saltB64: uint8ToBase64(salt),
    ivB64: uint8ToBase64(iv),
    ciphertextB64: arrayBufferToBase64(ciphertext),
  };
}

export async function unwrapPrivateKeyPkcs8(
  payload: WrappedPrivateKeyPayload,
  passphrase: string,
): Promise<ArrayBuffer> {
  const subtle = getSubtle();
  const pass = passphrase.trim();
  if (pass.length === 0) {
    throw new Error('Passphrase must not be empty');
  }

  const salt = new Uint8Array(base64ToArrayBuffer(payload.saltB64));
  const iv = new Uint8Array(base64ToArrayBuffer(payload.ivB64));
  const ciphertext = new Uint8Array(
    base64ToArrayBuffer(payload.ciphertextB64),
  );

  const aesKey = await deriveAesGcmKeyFromPassphrase(
    pass,
    salt,
    payload.pbkdf2Iterations,
  );
  try {
    return await subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext,
    );
  } catch {
    throw new Error('Wrong passphrase or corrupted private key data');
  }
}
