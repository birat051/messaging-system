/**
 * **Regression (bugfix — sign out / relogin):** `docs/TASK_CHECKLIST.md` — hybrid **logout → login → decrypt**
 * with **`deviceId`** ↔ **`encryptedMessageKeys`** alignment.
 *
 * Uses **real Web Crypto** (no crypto mocks) and **fake-indexeddb** (same as `privateKeyStorage` tests). Does not
 * mount **React** / full **Redux** — it proves the **wire + IDB contract** that must hold when **IndexedDB** survives
 * sign-out and **`getStoredDeviceId`** still matches keys in **`encryptedMessageKeys`**.
 *
 * Related: **`secondBrowserSync.integration.test.ts`** — Feature 13 **unwrap → wrap → merge **`encryptedMessageKeys`** for a **new** device (no IDB scenario).
 */

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_MOCK_USER_ID } from '@/common/mocks/__fixtures__';
import {
  decryptHybridMessageToUtf8,
  encryptUtf8ToHybridSendPayload,
  mergeHybridDeviceRows,
} from '@/common/crypto/messageHybrid';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from '@/common/crypto/keypair';
import {
  deleteStoredPrivateKey,
  getStoredDeviceId,
  setStoredDeviceId,
} from '@/common/crypto/privateKeyStorage';

const SELF_DEVICE_ID = 'regression-device-self';
const PEER_DEVICE_ID = 'regression-device-peer';

describe('Logout → relogin hybrid decrypt regression (deviceId ↔ encryptedMessageKeys)', () => {
  const userId = DEFAULT_MOCK_USER_ID;

  beforeEach(async () => {
    await deleteStoredPrivateKey(userId);
  });

  afterEach(async () => {
    await deleteStoredPrivateKey(userId);
  });

  it('persisted IndexedDB deviceId stays in encryptedMessageKeys; decrypt own-sent and peer-received after simulated session boundary', async () => {
    const peerKeys = await generateP256EcdhKeyPair();
    const selfKeys = await generateP256EcdhKeyPair();
    const peerSpki = await exportPublicKeySpkiBase64(peerKeys.publicKey);
    const selfSpki = await exportPublicKeySpkiBase64(selfKeys.publicKey);

    const devices = mergeHybridDeviceRows(
      [{ deviceId: PEER_DEVICE_ID, publicKey: peerSpki }],
      [{ deviceId: SELF_DEVICE_ID, publicKey: selfSpki }],
    );

    const plaintext = 'hybrid plaintext survives session boundary alignment';
    const send = await encryptUtf8ToHybridSendPayload(plaintext, devices);

    await setStoredDeviceId(userId, SELF_DEVICE_ID);
    expect(await getStoredDeviceId(userId)).toBe(SELF_DEVICE_ID);

    const keysInWire = Object.keys(send.encryptedMessageKeys ?? {}).sort();
    expect(keysInWire).toEqual([PEER_DEVICE_ID, SELF_DEVICE_ID].sort());
    expect(send.encryptedMessageKeys?.[SELF_DEVICE_ID]?.trim()?.length ?? 0).toBeGreaterThan(0);
    expect(send.encryptedMessageKeys?.[PEER_DEVICE_ID]?.trim()?.length ?? 0).toBeGreaterThan(0);

    const wire = {
      body: send.body,
      iv: send.iv,
      encryptedMessageKeys: send.encryptedMessageKeys!,
    };

    /** Peer-received (this user is recipient “peer device” side of the envelope). */
    const asPeerRecipient = await decryptHybridMessageToUtf8(
      wire,
      PEER_DEVICE_ID,
      peerKeys.privateKey,
    );
    expect(asPeerRecipient).toBe(plaintext);

    /** Own-sent copy (sender’s device entry). */
    const asOwnSenderDevice = await decryptHybridMessageToUtf8(
      wire,
      SELF_DEVICE_ID,
      selfKeys.privateKey,
    );
    expect(asOwnSenderDevice).toBe(plaintext);

    /** Simulate sign-out clearing Redux only — IndexedDB **`deviceIdentity`** untouched (`useAuth` never wipes IDB). */
    expect(await getStoredDeviceId(userId)).toBe(SELF_DEVICE_ID);

    const persistedId = (await getStoredDeviceId(userId))!.trim();
    expect(send.encryptedMessageKeys[persistedId]?.trim()?.length ?? 0).toBeGreaterThan(0);

    /** After “re-login”, same **`deviceId`** + private material still unwrap the same wire. */
    expect(
      await decryptHybridMessageToUtf8(wire, persistedId, selfKeys.privateKey),
    ).toBe(plaintext);
    expect(
      await decryptHybridMessageToUtf8(wire, PEER_DEVICE_ID, peerKeys.privateKey),
    ).toBe(plaintext);
  });

  it('misaligned deviceId (not in encryptedMessageKeys) cannot decrypt — documents failure mode when map and IDB diverge', async () => {
    const peerKeys = await generateP256EcdhKeyPair();
    const spki = await exportPublicKeySpkiBase64(peerKeys.publicKey);
    const send = await encryptUtf8ToHybridSendPayload('x', [
      { deviceId: PEER_DEVICE_ID, publicKey: spki },
    ]);

    await setStoredDeviceId(userId, 'wrong-device-id-not-in-map');

    await expect(
      decryptHybridMessageToUtf8(
        {
          body: send.body,
          iv: send.iv,
          encryptedMessageKeys: send.encryptedMessageKeys,
        },
        (await getStoredDeviceId(userId))!,
        peerKeys.privateKey,
      ),
    ).rejects.toThrow(/no wrapped key for this device/i);
  });
});
