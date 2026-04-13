/**
 * P-256 **ECIES** envelope for direct 1:1 message bodies (**`README.md`** / **`docs/PROJECT_PLAN.md` §14**).
 * **`body`** on the wire remains a UTF-8 string; opaque to the server.
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';

export const E2EE_BODY_PREFIX = 'E2EE_JSON_V1:';

const HKDF_INFO = new TextEncoder().encode('messaging/v1/ecies/direct/1');

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Web Crypto API (crypto.subtle) is not available');
  }
  return subtle;
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

export type E2eeEnvelopeV1 = {
  v: 1;
  alg: 'ecies-p256-hkdf-aes256gcm';
  ephPubSpkiB64: string;
  hkdfSaltB64: string;
  ivB64: string;
  ciphertextB64: string;
};

function parseEnvelope(body: string): E2eeEnvelopeV1 | null {
  const t = body.trim();
  if (!t.startsWith(E2EE_BODY_PREFIX)) {
    return null;
  }
  try {
    const raw = JSON.parse(t.slice(E2EE_BODY_PREFIX.length)) as E2eeEnvelopeV1;
    if (
      raw?.v === 1 &&
      raw.alg === 'ecies-p256-hkdf-aes256gcm' &&
      typeof raw.ephPubSpkiB64 === 'string' &&
      typeof raw.hkdfSaltB64 === 'string' &&
      typeof raw.ivB64 === 'string' &&
      typeof raw.ciphertextB64 === 'string'
    ) {
      return raw;
    }
    return null;
  } catch {
    return null;
  }
}

/** Whether **`body`** is a valid **`E2EE_JSON_V1:`** envelope (wire format). */
export function isE2eeEnvelopeBody(body: string | null | undefined): boolean {
  if (body == null || typeof body !== 'string') {
    return false;
  }
  return parseEnvelope(body) !== null;
}

async function deriveAes256GcmKeyFromEcdh(
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
      info: HKDF_INFO as BufferSource,
    },
    hkdfKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt UTF-8 plaintext for a recipient’s **SPKI Base64** directory key.
 * Returns **`E2EE_JSON_V1:`** + JSON envelope (opaque string for **`SendMessageRequest.body`**).
 */
export async function encryptUtf8ToE2eeBody(
  plaintext: string,
  recipientSpkiB64: string,
): Promise<string> {
  const subtle = getSubtle();
  const recipientPublic = await importRecipientPublicEcdhP256(recipientSpkiB64);
  const ephemeralPair = await subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits'],
  );
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const aesKey = await deriveAes256GcmKeyFromEcdh(
    ephemeralPair.privateKey,
    recipientPublic,
    salt,
  );
  const iv = new Uint8Array(12);
  globalThis.crypto.getRandomValues(iv);
  const pt = new TextEncoder().encode(plaintext);
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, pt);
  const ephDer = await subtle.exportKey('spki', ephemeralPair.publicKey);
  const env: E2eeEnvelopeV1 = {
    v: 1,
    alg: 'ecies-p256-hkdf-aes256gcm',
    ephPubSpkiB64: arrayBufferToBase64(ephDer),
    hkdfSaltB64: arrayBufferToBase64(salt.buffer as ArrayBuffer),
    ivB64: arrayBufferToBase64(iv.buffer as ArrayBuffer),
    ciphertextB64: arrayBufferToBase64(ct),
  };
  return `${E2EE_BODY_PREFIX}${JSON.stringify(env)}`;
}

/**
 * Decrypt a body produced by **`encryptUtf8ToE2eeBody`** (roundtrip / recipient UI).
 */
export async function decryptE2eeBodyToUtf8(
  body: string,
  recipientPrivateKey: CryptoKey,
): Promise<string> {
  const env = parseEnvelope(body);
  if (!env) {
    throw new Error('Not an E2EE_JSON_V1 message body');
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
  const aesKey = await deriveAes256GcmKeyFromEcdh(
    recipientPrivateKey,
    ephemeralPublic,
    salt,
  );
  const iv = new Uint8Array(base64ToArrayBuffer(env.ivB64));
  const ct = new Uint8Array(base64ToArrayBuffer(env.ciphertextB64));
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    ct,
  );
  return new TextDecoder().decode(pt);
}
