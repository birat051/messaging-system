/**
 * AES-256-GCM message body + P-256 ECDH/HKDF/AES-GCM per-device key wrap (**`docs/PROJECT_PLAN.md`** §7.1).
 * Used by **`messageHybrid`**; opaque on the wire — **do not** log key material or ciphertext.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';

const HKDF_WRAP_INFO = new TextEncoder().encode(
  'messaging/v1/hybrid/msgkey-wrap/1',
);

/** Version **`1`** JSON envelope stored in **`encryptedMessageKeys[deviceId]`**. */
export const MESSAGE_KEY_WRAP_ENVELOPE_V = 1 as const;

/** Label inside the wrap envelope — must match **`messageHybrid`** / server-opaque storage. */
export const MESSAGE_KEY_WRAP_ALG = 'p256-hkdf-aes256gcm-wrap-v1' as const;

export type MessageKeyWrapEnvelopeV1 = {
  v: typeof MESSAGE_KEY_WRAP_ENVELOPE_V;
  alg: typeof MESSAGE_KEY_WRAP_ALG;
  ephPubSpkiB64: string;
  hkdfSaltB64: string;
  ivB64: string;
  ciphertextB64: string;
};

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available');
  }
  return subtle;
}

function assertMessageKeyLength(messageKey: Uint8Array): void {
  if (messageKey.byteLength !== 32) {
    throw new Error('Message key must be 32 bytes (AES-256)');
  }
}

/** 32 cryptographically random bytes (AES-256 message key material). */
export async function generateMessageKey(): Promise<Uint8Array> {
  const raw = new Uint8Array(32);
  globalThis.crypto.getRandomValues(raw);
  return raw;
}

async function importAes256GcmKey(
  raw: Uint8Array,
  usages: KeyUsage[],
): Promise<CryptoKey> {
  assertMessageKeyLength(raw);
  const copy = new Uint8Array(raw);
  return getSubtle().importKey(
    'raw',
    copy,
    { name: 'AES-GCM', length: 256 },
    false,
    usages,
  );
}

/**
 * Encrypt UTF-8 **`plaintext`** with **`messageKey`** (32 raw bytes). Random 96-bit IV per call.
 */
export async function encryptMessageBody(
  messageKey: Uint8Array,
  plaintext: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const subtle = getSubtle();
  const key = await importAes256GcmKey(messageKey, ['encrypt']);
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const pt = new TextEncoder().encode(plaintext);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, pt);
  return { ciphertext: new Uint8Array(ct), iv };
}

/**
 * Decrypt **`ciphertext`** (includes GCM tag) to a UTF-8 string.
 */
export async function decryptMessageBody(
  messageKey: Uint8Array,
  ciphertext: Uint8Array,
  iv: Uint8Array,
): Promise<string> {
  if (iv.byteLength !== 12) {
    throw new Error('IV must be 12 bytes for AES-GCM');
  }
  const subtle = getSubtle();
  const key = await importAes256GcmKey(messageKey, ['decrypt']);
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );
  return new TextDecoder().decode(pt);
}

async function importRecipientPublicEcdhP256(spkiB64: string): Promise<CryptoKey> {
  const der = base64ToArrayBuffer(spkiB64.trim());
  return getSubtle().importKey(
    'spki',
    new Uint8Array(der),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
}

async function deriveWrapKeyFromEcdh(
  localPrivate: CryptoKey,
  remotePublic: CryptoKey,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const sharedBits = await subtle.deriveBits(
    { name: 'ECDH', public: remotePublic },
    localPrivate,
    256,
  );
  const ikm = new Uint8Array(sharedBits);
  const hkdfKey = await subtle.importKey(
    'raw',
    ikm,
    { name: 'HKDF' },
    false,
    ['deriveKey'],
  );
  return subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: HKDF_WRAP_INFO as BufferSource,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Wrap **`messageKey`** (32 raw bytes) for **`devicePublicKey`** (P-256 ECDH SPKI Base64).
 * Returns a JSON string (**`MessageKeyWrapEnvelopeV1`**) suitable for **`encryptedMessageKeys`**.
 */
export async function wrapMessageKey(
  messageKey: Uint8Array,
  devicePublicKeySpkiBase64: string,
): Promise<string> {
  assertMessageKeyLength(messageKey);
  const subtle = getSubtle();
  const recipientPublic = await importRecipientPublicEcdhP256(
    devicePublicKeySpkiBase64,
  );
  const msgKeyBytes = new Uint8Array(messageKey);
  const ephemeralPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const wrapAes = await deriveWrapKeyFromEcdh(
    ephemeralPair.privateKey,
    recipientPublic,
    salt,
  );
  const ivW = new Uint8Array(12);
  globalThis.crypto.getRandomValues(ivW);
  const wct = await subtle.encrypt(
    { name: 'AES-GCM', iv: ivW },
    wrapAes,
    msgKeyBytes,
  );
  const ephDer = await subtle.exportKey('spki', ephemeralPair.publicKey);
  const env: MessageKeyWrapEnvelopeV1 = {
    v: MESSAGE_KEY_WRAP_ENVELOPE_V,
    alg: MESSAGE_KEY_WRAP_ALG,
    ephPubSpkiB64: arrayBufferToBase64(ephDer),
    hkdfSaltB64: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    ivB64: arrayBufferToBase64(ivW.buffer as ArrayBuffer),
    ciphertextB64: arrayBufferToBase64(wct),
  };
  return JSON.stringify(env);
}

export function parseMessageKeyWrapEnvelope(
  raw: string,
): MessageKeyWrapEnvelopeV1 | null {
  try {
    const o = JSON.parse(raw) as MessageKeyWrapEnvelopeV1;
    if (
      o?.v === MESSAGE_KEY_WRAP_ENVELOPE_V &&
      o.alg === MESSAGE_KEY_WRAP_ALG &&
      typeof o.ephPubSpkiB64 === 'string' &&
      typeof o.hkdfSaltB64 === 'string' &&
      typeof o.ivB64 === 'string' &&
      typeof o.ciphertextB64 === 'string'
    ) {
      return o;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Unwrap a **`wrapMessageKey`** JSON string using the recipient's P-256 ECDH private key.
 */
export async function unwrapMessageKey(
  encryptedKey: string,
  devicePrivateKey: CryptoKey,
): Promise<Uint8Array> {
  const env = parseMessageKeyWrapEnvelope(encryptedKey);
  if (!env) {
    throw new Error('Invalid hybrid wrap envelope');
  }
  const subtle = getSubtle();
  const ephPubDer = base64ToArrayBuffer(env.ephPubSpkiB64);
  const ephemeralPublic = await subtle.importKey(
    'spki',
    new Uint8Array(ephPubDer),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  );
  const salt = new Uint8Array(base64ToArrayBuffer(env.hkdfSaltB64));
  const wrapAes = await deriveWrapKeyFromEcdh(
    devicePrivateKey,
    ephemeralPublic,
    salt,
  );
  const ivW = new Uint8Array(base64ToArrayBuffer(env.ivB64));
  const wct = new Uint8Array(base64ToArrayBuffer(env.ciphertextB64));
  const msgKeyRaw = await subtle.decrypt(
    { name: 'AES-GCM', iv: ivW },
    wrapAes,
    wct,
  );
  return new Uint8Array(msgKeyRaw);
}
