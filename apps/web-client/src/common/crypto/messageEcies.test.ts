import { describe, expect, it } from 'vitest';
import { arrayBufferToBase64 } from './encoding';
import { generateP256EcdhKeyPair } from './keypair';
import {
  encryptUtf8ToE2eeBody,
  decryptE2eeBodyToUtf8,
  E2EE_BODY_PREFIX,
} from './messageEcies';

describe('messageEcies', () => {
  it('roundtrips UTF-8 plaintext with P-256 ECIES envelope', async () => {
    const recipient = await generateP256EcdhKeyPair();
    const subtle = globalThis.crypto.subtle;
    const spkiDer = await subtle.exportKey('spki', recipient.publicKey);
    const recipientSpkiB64 = arrayBufferToBase64(spkiDer);

    const plain = 'Hello — E2EE checkpoint 🔐';
    const body = await encryptUtf8ToE2eeBody(plain, recipientSpkiB64);
    expect(body.startsWith(E2EE_BODY_PREFIX)).toBe(true);

    const out = await decryptE2eeBodyToUtf8(body, recipient.privateKey);
    expect(out).toBe(plain);
  });
});
