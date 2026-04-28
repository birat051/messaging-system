import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { registerDeviceRequestSchema } from './schemas.js';

const validSpki = (() => {
  const { publicKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  return (publicKey.export({ type: 'spki', format: 'der' }) as Buffer).toString(
    'base64',
  );
})();

describe('registerDeviceRequestSchema', () => {
  it('accepts publicKey only', () => {
    const out = registerDeviceRequestSchema.parse({
      publicKey: validSpki,
    });
    expect(out.publicKey).toBe(validSpki);
    expect(out.bootstrap).toBe(false);
  });

  it('accepts pubKey only', () => {
    const out = registerDeviceRequestSchema.parse({ pubKey: validSpki });
    expect(out.publicKey).toBe(validSpki);
  });

  it('rejects when neither publicKey nor pubKey', () => {
    const r = registerDeviceRequestSchema.safeParse({ deviceLabel: 'x' });
    expect(r.success).toBe(false);
  });

  it('allows identical publicKey and pubKey when both sent', () => {
    const out = registerDeviceRequestSchema.parse({
      publicKey: validSpki,
      pubKey: validSpki,
    });
    expect(out.publicKey).toBe(validSpki);
  });

  it('parses deviceLabel and bootstrap', () => {
    const out = registerDeviceRequestSchema.parse({
      pubKey: validSpki,
      deviceLabel: 'Chrome on MacBook',
      bootstrap: true,
    });
    expect(out.deviceLabel).toBe('Chrome on MacBook');
    expect(out.bootstrap).toBe(true);
  });
});
