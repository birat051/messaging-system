import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decodeSpkiBase64, parseP256SpkiPublicKeyOrThrow } from './publicKeyP256.js';

describe('parseP256SpkiPublicKeyOrThrow', () => {
  it('accepts P-256 SPKI (standard Base64)', () => {
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const b64 = der.toString('base64');
    expect(() => parseP256SpkiPublicKeyOrThrow(b64)).not.toThrow();
  });

  it('accepts Base64url', () => {
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    const b64url = der
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(() => parseP256SpkiPublicKeyOrThrow(b64url)).not.toThrow();
  });

  it('rejects secp256k1 SPKI', () => {
    const { publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'secp256k1',
    });
    const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    expect(() =>
      parseP256SpkiPublicKeyOrThrow(der.toString('base64')),
    ).toThrow(/P-256/);
  });

  it('rejects RSA SPKI', () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const der = publicKey.export({ type: 'spki', format: 'der' }) as Buffer;
    expect(() =>
      parseP256SpkiPublicKeyOrThrow(der.toString('base64')),
    ).toThrow();
  });

  it('rejects garbage', () => {
    expect(() => parseP256SpkiPublicKeyOrThrow('not-base64!!!')).toThrow();
  });
});

describe('decodeSpkiBase64', () => {
  it('throws on empty', () => {
    expect(() => decodeSpkiBase64('   ')).toThrow();
  });
});
