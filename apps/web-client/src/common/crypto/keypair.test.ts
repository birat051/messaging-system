import { describe, expect, it } from 'vitest';
import { webcrypto } from 'node:crypto';
import {
  exportPrivateKeyPkcs8Base64,
  exportPublicKeySpkiBase64,
  generateP256EcdhKeyPair,
} from './keypair';

/**
 * Fixed **P-256 ECDH** PKCS#8 + SPKI pair (OpenSSL-generated fixture).
 * Used only to assert **import → export** round-trips match known DER — not production secrets.
 */
const VECTOR_PKCS8_B64 =
  'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg5jOQm7VhcrJ1bRZm3gj2nPZj/TnSBboTtXfMs59yRfmhRANCAAR5a1nSOILPLqLtzV+EM1xy31ZR6vUUL3S7TeJwYmim5hwIN4Bq6zNP3QKy6IA4ddqsAInfIVQNxm6tPbYFYmsk';

const VECTOR_SPKI_B64 =
  'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEeWtZ0jiCzy6i7c1fhDNcct9WUer1FC90u03icGJopuYcCDeAauszT90CsuiAOHXarACJ3yFUDcZurT22BWJrJA==';

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = Buffer.from(b64, 'base64');
  return bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength);
}

describe('generateP256EcdhKeyPair', () => {
  it('produces extractable ECDH P-256 keys and SPKI/PKCS8 exports of expected size', async () => {
    const { publicKey, privateKey } = await generateP256EcdhKeyPair();

    expect(publicKey.algorithm).toMatchObject({
      name: 'ECDH',
      namedCurve: 'P-256',
    });
    expect(privateKey.algorithm).toMatchObject({
      name: 'ECDH',
      namedCurve: 'P-256',
    });

    const spki = await exportPublicKeySpkiBase64(publicKey);
    const pkcs8 = await exportPrivateKeyPkcs8Base64(privateKey);

    const spkiDer = Buffer.from(spki, 'base64');
    const pkcs8Der = Buffer.from(pkcs8, 'base64');

    expect(spkiDer[0]).toBe(0x30);
    expect(pkcs8Der[0]).toBe(0x30);
    expect(spkiDer.length).toBeGreaterThanOrEqual(80);
    expect(spkiDer.length).toBeLessThanOrEqual(120);
    expect(pkcs8Der.length).toBeGreaterThanOrEqual(120);
    expect(pkcs8Der.length).toBeLessThanOrEqual(180);
  });
});

describe('known vector (PKCS8 / SPKI)', () => {
  it('round-trips PKCS8 import → PKCS8 export', async () => {
    const subtle = webcrypto.subtle;
    const pkcs8Buf = base64ToArrayBuffer(VECTOR_PKCS8_B64);
    const priv = await subtle.importKey(
      'pkcs8',
      pkcs8Buf,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveBits'],
    );
    const out = await subtle.exportKey('pkcs8', priv);
    expect(Buffer.from(out).toString('base64')).toBe(VECTOR_PKCS8_B64);
  });

  it('round-trips SPKI import → SPKI export', async () => {
    const subtle = webcrypto.subtle;
    const spkiBuf = base64ToArrayBuffer(VECTOR_SPKI_B64);
    const pub = await subtle.importKey(
      'spki',
      spkiBuf,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const out = await subtle.exportKey('spki', pub);
    expect(Buffer.from(out).toString('base64')).toBe(VECTOR_SPKI_B64);
  });

  it('matches **`exportPublicKeySpkiBase64`** output for the vector public key', async () => {
    const subtle = webcrypto.subtle;
    const spkiBuf = base64ToArrayBuffer(VECTOR_SPKI_B64);
    const pub = await subtle.importKey(
      'spki',
      spkiBuf,
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      [],
    );
    const b64 = await exportPublicKeySpkiBase64(pub as CryptoKey);
    expect(b64).toBe(VECTOR_SPKI_B64);
  });
});
