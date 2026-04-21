/**
 * **Integration checkpoint (per-device)** — `docs/TASK_CHECKLIST.md` §Feature 1 (B).
 *
 * - **Automatic device key setup** (no encryption wizard): **`SessionRestore`** + **`useSenderKeypairBootstrap`** call
 *   **`ensureUserKeypairReadyForMessaging`** before the shell paints; **`useSendEncryptedMessage`** invokes the same
 *   ensure path before the first hybrid send — covered by **`useSendEncryptedMessage.test.tsx`** (ensure mock) +
 *   **`ensureMessagingKeypair.test.ts`**.
 * - **Send path:** **`fetchDevicePublicKeys`** (recipient + **`me`**) → **`encryptUtf8ToHybridSendPayload`** →
 *   **`{ body, iv, encryptedMessageKeys, algorithm }`** — **`e2eeOutboundSendTrace.ts`**.
 * - **Receive path:** **`usePeerMessageDecryption`** uses **`getStoredDeviceId`** + **`decryptHybridMessageToUtf8`** with
 *   **`encryptedMessageKeys[myDeviceId]`** — **`e2eeInboundDecryptTrace.ts`**.
 *
 * This file asserts the **cryptographic wire contract** end-to-end with **real** Web Crypto (no mocks), matching
 * **`Message`** / **`SendMessageRequest`** hybrid fields from OpenAPI.
 */

import { describe, expect, it } from 'vitest';
import type { components } from '@/generated/api-types';
import {
  decryptHybridMessageToUtf8,
  encryptUtf8ToHybridSendPayload,
  mergeHybridDeviceRows,
  MESSAGE_HYBRID_ALGORITHM,
} from '@/common/crypto/messageHybrid';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from '@/common/crypto/keypair';

type HybridWire = Pick<
  components['schemas']['Message'],
  'body' | 'iv' | 'encryptedMessageKeys' | 'algorithm'
>;

describe('E2EE per-device hybrid integration checkpoint', () => {
  it('OpenAPI hybrid Message fields round-trip: sender wraps per device; recipient decrypts with encryptedMessageKeys[myDeviceId]', async () => {
    const peer = await generateP256EcdhKeyPair();
    const self = await generateP256EcdhKeyPair();
    const peerSpki = await exportPublicKeySpkiBase64(peer.publicKey);
    const selfSpki = await exportPublicKeySpkiBase64(self.publicKey);

    const devices = mergeHybridDeviceRows(
      [{ deviceId: 'peer-device', publicKey: peerSpki }],
      [{ deviceId: 'sender-device', publicKey: selfSpki }],
    );

    const send = await encryptUtf8ToHybridSendPayload(
      'First encrypted message (per-device hybrid)',
      devices,
    );

    const wire: HybridWire = {
      body: send.body,
      iv: send.iv,
      encryptedMessageKeys: send.encryptedMessageKeys,
      algorithm: send.algorithm,
    };

    expect(wire.algorithm).toBe(MESSAGE_HYBRID_ALGORITHM);
    expect(wire.body).toBeTruthy();
    expect(wire.iv).toBeTruthy();
    expect(Object.keys(wire.encryptedMessageKeys ?? {}).sort()).toEqual(
      ['peer-device', 'sender-device'].sort(),
    );

    const asPeer = await decryptHybridMessageToUtf8(
      {
        body: wire.body!,
        iv: wire.iv!,
        encryptedMessageKeys: wire.encryptedMessageKeys!,
      },
      'peer-device',
      peer.privateKey,
    );
    expect(asPeer).toBe('First encrypted message (per-device hybrid)');

    const asSender = await decryptHybridMessageToUtf8(
      {
        body: wire.body!,
        iv: wire.iv!,
        encryptedMessageKeys: wire.encryptedMessageKeys!,
      },
      'sender-device',
      self.privateKey,
    );
    expect(asSender).toBe('First encrypted message (per-device hybrid)');
  });

  it('decrypt fails when myDeviceId has no entry in encryptedMessageKeys (recipient must sync or use another device)', async () => {
    const peer = await generateP256EcdhKeyPair();
    const spki = await exportPublicKeySpkiBase64(peer.publicKey);
    const send = await encryptUtf8ToHybridSendPayload('x', [
      { deviceId: 'only-peer', publicKey: spki },
    ]);

    await expect(
      decryptHybridMessageToUtf8(
        {
          body: send.body,
          iv: send.iv,
          encryptedMessageKeys: send.encryptedMessageKeys,
        },
        'missing-device-id',
        peer.privateKey,
      ),
    ).rejects.toThrow(/no wrapped key for this device/i);
  });
});
