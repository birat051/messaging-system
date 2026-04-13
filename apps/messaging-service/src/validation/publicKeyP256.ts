import { createPublicKey } from 'node:crypto';

const P256_NAMED_CURVE = 'prime256v1';

/**
 * Decode Base64 or Base64url (Web Crypto / `btoa` style) into a buffer.
 */
export function decodeSpkiBase64(input: string): Buffer {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    throw new Error('publicKey is empty');
  }
  const base64 = trimmed.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (base64.length % 4)) % 4;
  const padded = base64 + '='.repeat(padLen);
  const buf = Buffer.from(padded, 'base64');
  if (buf.length === 0) {
    throw new Error('publicKey is not valid Base64');
  }
  return buf;
}

/**
 * Ensures **`publicKey`** is **P-256** (**`prime256v1`**) **SPKI** (DER) — the canonical wire format for
 * **`README.md` (E2EE) / `docs/PROJECT_PLAN.md` §14**. Rejects RSA, other curves, and corrupt DER.
 */
export function parseP256SpkiPublicKeyOrThrow(publicKey: string): void {
  let der: Buffer;
  try {
    der = decodeSpkiBase64(publicKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid public key encoding';
    throw new Error(msg);
  }

  if (der.length > 4096) {
    throw new Error('publicKey DER exceeds maximum length');
  }

  let key;
  try {
    key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    throw new Error('publicKey is not a valid SPKI public key');
  }

  if (key.asymmetricKeyType !== 'ec') {
    throw new Error('publicKey must be an elliptic-curve key (P-256)');
  }

  const namedCurve = key.asymmetricKeyDetails?.namedCurve;
  if (namedCurve !== P256_NAMED_CURVE) {
    throw new Error(`publicKey must use curve P-256 (${P256_NAMED_CURVE})`);
  }
}
