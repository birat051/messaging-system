import { describe, expect, it } from 'vitest';
import {
  encryptUtf8ToHybridSendPayload,
  decryptHybridMessageToUtf8,
  MESSAGE_HYBRID_ALGORITHM,
  mergeHybridDeviceRows,
} from './messageHybrid';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from './keypair';

describe('messageHybrid', () => {
  it('round-trips UTF-8 plaintext for one device', async () => {
    const pair = await generateP256EcdhKeyPair();
    const spki = await exportPublicKeySpkiBase64(pair.publicKey);

    const devices = mergeHybridDeviceRows([
      { deviceId: 'dev-a', publicKey: spki },
    ]);
    const send = await encryptUtf8ToHybridSendPayload('Hello hybrid 🌐', devices);

    expect(send.algorithm).toBe(MESSAGE_HYBRID_ALGORITHM);
    expect(send.body.length).toBeGreaterThan(0);
    expect(send.iv.length).toBeGreaterThan(0);
    expect(send.encryptedMessageKeys['dev-a']).toBeDefined();

    const pt = await decryptHybridMessageToUtf8(
      {
        body: send.body,
        iv: send.iv,
        encryptedMessageKeys: send.encryptedMessageKeys,
      },
      'dev-a',
      pair.privateKey,
    );
    expect(pt).toBe('Hello hybrid 🌐');
  });

  it('produces encryptedMessageKeys for both recipient and sender devices; same body/iv/algorithm (Feature 11)', async () => {
    const peer = await generateP256EcdhKeyPair();
    const self = await generateP256EcdhKeyPair();
    const peerSpki = await exportPublicKeySpkiBase64(peer.publicKey);
    const selfSpki = await exportPublicKeySpkiBase64(self.publicKey);

    const devices = mergeHybridDeviceRows(
      [{ deviceId: 'peer-dev', publicKey: peerSpki }],
      [{ deviceId: 'sender-dev', publicKey: selfSpki }],
    );
    expect(devices).toHaveLength(2);

    const send = await encryptUtf8ToHybridSendPayload(
      'Both sides can decrypt',
      devices,
    );

    expect(send.algorithm).toBe(MESSAGE_HYBRID_ALGORITHM);
    expect(send.body.length).toBeGreaterThan(0);
    expect(send.iv.length).toBeGreaterThan(0);
    expect(Object.keys(send.encryptedMessageKeys).sort()).toEqual(
      ['peer-dev', 'sender-dev'].sort(),
    );

    const fromPeer = await decryptHybridMessageToUtf8(
      {
        body: send.body,
        iv: send.iv,
        encryptedMessageKeys: send.encryptedMessageKeys,
      },
      'peer-dev',
      peer.privateKey,
    );
    const fromSender = await decryptHybridMessageToUtf8(
      {
        body: send.body,
        iv: send.iv,
        encryptedMessageKeys: send.encryptedMessageKeys,
      },
      'sender-dev',
      self.privateKey,
    );
    expect(fromPeer).toBe('Both sides can decrypt');
    expect(fromSender).toBe('Both sides can decrypt');
  });

  it('checklist: full encrypt/decrypt round-trip (message key + AES-GCM body + per-device wrap)', async () => {
    const pair = await generateP256EcdhKeyPair();
    const spki = await exportPublicKeySpkiBase64(pair.publicKey);
    const devices = mergeHybridDeviceRows([{ deviceId: 'device-under-test', publicKey: spki }]);
    const send = await encryptUtf8ToHybridSendPayload('Round-trip body', devices);
    const plain = await decryptHybridMessageToUtf8(
      {
        body: send.body,
        iv: send.iv,
        encryptedMessageKeys: send.encryptedMessageKeys,
      },
      'device-under-test',
      pair.privateKey,
    );
    expect(plain).toBe('Round-trip body');
  });
});
