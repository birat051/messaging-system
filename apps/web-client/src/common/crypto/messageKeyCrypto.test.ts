import { describe, expect, it, vi } from 'vitest';
import {
  decryptMessageBody,
  encryptMessageBody,
  generateMessageKey,
  MESSAGE_KEY_WRAP_ALG,
  MESSAGE_KEY_WRAP_ENVELOPE_V,
  parseMessageKeyWrapEnvelope,
  unwrapMessageKey,
  wrapMessageKey,
} from './messageKeyCrypto';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from './keypair';

/** NIST-style test key (32 bytes) — **not** a production secret. */
const TEST_MESSAGE_KEY_HEX =
  '0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20';

/** Fixed 96-bit IV for deterministic **`encryptMessageBody`** vector (via **`getRandomValues`** mock). */
const TEST_IV_HEX = '000000000000000000000001';

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToHex(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i++) {
    s += u[i]!.toString(16).padStart(2, '0');
  }
  return s;
}

describe('messageKeyCrypto', () => {
  it('generateMessageKey returns 32 random bytes', async () => {
    const a = await generateMessageKey();
    const b = await generateMessageKey();
    expect(a.byteLength).toBe(32);
    expect(b.byteLength).toBe(32);
    expect(bytesToHex(a)).not.toBe(bytesToHex(b));
  });

  it('encryptMessageBody / decryptMessageBody match AES-256-GCM test vector (fixed IV)', async () => {
    const messageKey = hexToBytes(TEST_MESSAGE_KEY_HEX);
    const expectedIv = hexToBytes(TEST_IV_HEX);
    const plaintext = 'Hello, test vector.';
    /** Ciphertext + tag from Web Crypto (Node reference) with this key, IV, and plaintext. */
    const expectedCiphertextHex =
      'e4ad86d0ca2c117a12bbb449e4b118deba0215c2a1bdd32be97c4110e46047df581e1d';

    const getRandomValuesSpy = vi
      .spyOn(globalThis.crypto, 'getRandomValues')
      .mockImplementation(<T extends ArrayBufferView>(array: T): T => {
        if (array.byteLength === 12) {
          new Uint8Array(
            array.buffer,
            array.byteOffset,
            array.byteLength,
          ).set(expectedIv);
        }
        return array;
      });

    const { ciphertext, iv } = await encryptMessageBody(messageKey, plaintext);
    getRandomValuesSpy.mockRestore();

    expect(bytesToHex(iv)).toBe(TEST_IV_HEX);
    expect(bytesToHex(ciphertext)).toBe(expectedCiphertextHex);

    const roundTrip = await decryptMessageBody(messageKey, ciphertext, iv);
    expect(roundTrip).toBe(plaintext);
  });

  it('decryptMessageBody rejects wrong IV length', async () => {
    const messageKey = hexToBytes(TEST_MESSAGE_KEY_HEX);
    const badIv = new Uint8Array(11);
    await expect(
      decryptMessageBody(messageKey, new Uint8Array(16), badIv),
    ).rejects.toThrow(/IV must be 12 bytes/);
  });

  it('encryptMessageBody throws when message key is not 32 bytes', async () => {
    await expect(encryptMessageBody(new Uint8Array(31), 'x')).rejects.toThrow(
      /32 bytes/,
    );
  });

  it('wrapMessageKey / unwrapMessageKey round-trip (ephemeral P-256 keys)', async () => {
    const pair = await generateP256EcdhKeyPair();
    const spki = await exportPublicKeySpkiBase64(pair.publicKey);
    const messageKey = await generateMessageKey();

    const encryptedKey = await wrapMessageKey(messageKey, spki);
    const parsed = parseMessageKeyWrapEnvelope(encryptedKey);
    expect(parsed).not.toBeNull();
    expect(parsed!.v).toBe(MESSAGE_KEY_WRAP_ENVELOPE_V);
    expect(parsed!.alg).toBe(MESSAGE_KEY_WRAP_ALG);

    const unwrapped = await unwrapMessageKey(encryptedKey, pair.privateKey);
    expect(bytesToHex(unwrapped)).toBe(bytesToHex(messageKey));
  });

  it('unwrapMessageKey throws on invalid envelope JSON', async () => {
    const pair = await generateP256EcdhKeyPair();
    await expect(
      unwrapMessageKey('not-json', pair.privateKey),
    ).rejects.toThrow(/Invalid hybrid wrap envelope/);
  });
});
