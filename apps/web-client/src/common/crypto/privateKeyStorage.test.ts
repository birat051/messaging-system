import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { base64ToArrayBuffer } from './encoding';
import {
  deleteStoredPrivateKey,
  hasStoredPrivateKey,
  listKeyringVersions,
  loadEncryptedPrivateKeyPkcs8,
  storeEncryptedPrivateKeyPkcs8,
  storeKeyringPrivateKeyPkcs8,
} from './privateKeyStorage';

/** Lower iteration count in tests only — production uses **`PBKDF2_ITERATIONS_DEFAULT`**. */
const TEST_PBKDF2_ITERATIONS = 10_000;

const VECTOR_PKCS8_B64 =
  'MIGHAgEAMBMGByqGSM49AgEGCCqGSM49AwEHBG0wawIBAQQg5jOQm7VhcrJ1bRZm3gj2nPZj/TnSBboTtXfMs59yRfmhRANCAAR5a1nSOILPLqLtzV+EM1xy31ZR6vUUL3S7TeJwYmim5hwIN4Bq6zNP3QKy6IA4ddqsAInfIVQNxm6tPbYFYmsk';

describe('privateKeyStorage (IndexedDB + PBKDF2 + AES-GCM)', () => {
  const userId = 'test-user-private-key-storage';

  it('stores and loads PKCS#8 with passphrase (round-trip)', async () => {
    await deleteStoredPrivateKey(userId);
    const pkcs8 = base64ToArrayBuffer(VECTOR_PKCS8_B64);
    await storeEncryptedPrivateKeyPkcs8(
      userId,
      pkcs8,
      'correct horse battery staple',
      TEST_PBKDF2_ITERATIONS,
    );
    expect(await hasStoredPrivateKey(userId)).toBe(true);

    const loaded = await loadEncryptedPrivateKeyPkcs8(
      userId,
      'correct horse battery staple',
    );
    expect(loaded).not.toBeNull();
    expect(new Uint8Array(loaded!)).toEqual(new Uint8Array(pkcs8));
  });

  it('rejects wrong passphrase', async () => {
    await deleteStoredPrivateKey(userId);
    const pkcs8 = base64ToArrayBuffer(VECTOR_PKCS8_B64);
    await storeEncryptedPrivateKeyPkcs8(
      userId,
      pkcs8,
      'secret-one',
      TEST_PBKDF2_ITERATIONS,
    );
    await expect(
      loadEncryptedPrivateKeyPkcs8(userId, 'secret-two'),
    ).rejects.toThrow(/Wrong passphrase/);
  });

  it('returns null when no key exists', async () => {
    await deleteStoredPrivateKey('missing-user-xyz');
    const loaded = await loadEncryptedPrivateKeyPkcs8(
      'missing-user-xyz',
      'any-passphrase-here',
    );
    expect(loaded).toBeNull();
  });

  it('keyring: stores two versions and load active returns highest version', async () => {
    const uid = 'test-user-keyring-two';
    await deleteStoredPrivateKey(uid);
    const pkcs8 = base64ToArrayBuffer(VECTOR_PKCS8_B64);
    const pass = 'correct horse battery staple';
    await storeKeyringPrivateKeyPkcs8(uid, 1, pkcs8, pass, {
      iterations: TEST_PBKDF2_ITERATIONS,
      publicKeySpkiB64: 'spki-v1',
    });
    await storeKeyringPrivateKeyPkcs8(uid, 2, pkcs8, pass, {
      iterations: TEST_PBKDF2_ITERATIONS,
      publicKeySpkiB64: 'spki-v2',
    });
    expect(await listKeyringVersions(uid)).toEqual([1, 2]);
    const active = await loadEncryptedPrivateKeyPkcs8(uid, pass);
    expect(active).not.toBeNull();
    expect(new Uint8Array(active!)).toEqual(new Uint8Array(pkcs8));
  });
});
