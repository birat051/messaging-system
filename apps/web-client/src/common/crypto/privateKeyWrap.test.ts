import { describe, expect, it } from 'vitest';
import { base64ToArrayBuffer } from './encoding';
import { unwrapPrivateKeyPkcs8, wrapPrivateKeyPkcs8 } from './privateKeyWrap';

const VECTOR_PKCS8_B64 =
  'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg5jOQm7VhcrJ1bRZm3gj2nPZj/TnSBboTtXfMs59yRfmhRANCAAR5a1nSOILPLqLtzV+EM1xy31ZR6vUUL3S7TeJwYmim5hwIN4Bq6zNP3QKy6IA4ddqsAInfIVQNxm6tPbYFYmsk';

describe('privateKeyWrap (PBKDF2 + AES-GCM)', () => {
  const iterations = 10_000;

  it('round-trips PKCS#8 with passphrase', async () => {
    const pkcs8 = base64ToArrayBuffer(VECTOR_PKCS8_B64);
    const wrapped = await wrapPrivateKeyPkcs8(
      pkcs8,
      'correct horse battery staple',
      iterations,
    );
    const out = await unwrapPrivateKeyPkcs8(wrapped, 'correct horse battery staple');
    expect(new Uint8Array(out)).toEqual(new Uint8Array(pkcs8));
  });

  it('rejects wrong passphrase', async () => {
    const pkcs8 = base64ToArrayBuffer(VECTOR_PKCS8_B64);
    const wrapped = await wrapPrivateKeyPkcs8(pkcs8, 'secret-one', iterations);
    await expect(unwrapPrivateKeyPkcs8(wrapped, 'secret-two')).rejects.toThrow(
      /Wrong passphrase/,
    );
  });
});
