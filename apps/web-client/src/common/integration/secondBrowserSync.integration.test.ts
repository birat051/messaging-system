/**
 * **Regression (second browser / Feature 13):** extends the **`logoutReloginHybridDecrypt.integration.test.ts`**
 * pattern — **real Web Crypto**, no React / Playwright.
 *
 * Simulates:
 * - **`device:sync_requested`** payload (**`DeviceSyncRequestedPayload`** — same fields as Socket.IO **`device:sync_requested`**).
 * - Trusted device **`unwrapMessageKey`** → **`wrapMessageKey`** for **`newDevicePublicKey`** (**`executeApproveDeviceKeySync`** inner loop).
 * - **`POST /users/me/sync/message-keys`** as **`$set`** on **`encryptedMessageKeys[targetDeviceId]`** (pure merge — mirrors **`applyBatchSyncMessageKeys`** outcome on the client-visible map).
 *
 * Asserts **`encryptedMessageKeys`** gains **`newDeviceId`** and the **same** ciphertext (**`body`/`iv`**) decrypts on the **new** device after the merge.
 */

import { describe, expect, it } from 'vitest';
import {
  decryptHybridMessageToUtf8,
  encryptUtf8ToHybridSendPayload,
  mergeHybridDeviceRows,
  MESSAGE_HYBRID_ALGORITHM,
} from '@/common/crypto/messageHybrid';
import { unwrapMessageKey, wrapMessageKey } from '@/common/crypto/messageKeyCrypto';
import { exportPublicKeySpkiBase64, generateP256EcdhKeyPair } from '@/common/crypto/keypair';
import type { DeviceSyncRequestedPayload } from '@/common/realtime/socketWorkerProtocol';

const SOURCE_DEVICE_ID = 'integration-src-device';
const NEW_DEVICE_ID = 'integration-new-browser';
const REMOTE_PEER_DEVICE_ID = 'integration-remote-peer';

/** Mimics **`POST`** batch body (**`BatchKeyUploadRequest`**) — JSON-safe strings only. */
function applyBatchSyncToEncryptedMessageKeys(params: {
  encryptedMessageKeys: Record<string, string>;
  targetDeviceId: string;
  keys: Array<{ messageId: string; encryptedMessageKey: string }>;
  messageId: string;
}): Record<string, string> {
  const hit = params.keys.find((k) => k.messageId === params.messageId);
  if (!hit) {
    return params.encryptedMessageKeys;
  }
  return {
    ...params.encryptedMessageKeys,
    [params.targetDeviceId.trim()]: hit.encryptedMessageKey.trim(),
  };
}

describe('Second-browser sync regression (socket payload + batch POST shape, encryptedMessageKeys)', () => {
  it('after simulated sync, encryptedMessageKeys[newDeviceId] exists and decrypts same ciphertext (trusted unwrap → wrap)', async () => {
    const trustedKeys = await generateP256EcdhKeyPair();
    const newKeys = await generateP256EcdhKeyPair();
    const remotePeerKeys = await generateP256EcdhKeyPair();

    const trustedSpki = await exportPublicKeySpkiBase64(trustedKeys.publicKey);
    const newSpki = await exportPublicKeySpkiBase64(newKeys.publicKey);
    const remoteSpki = await exportPublicKeySpkiBase64(remotePeerKeys.publicKey);

    const plaintext = 'Feature 13 regression — second browser gains wrapped key entry';

    const devices = mergeHybridDeviceRows(
      [{ deviceId: REMOTE_PEER_DEVICE_ID, publicKey: remoteSpki }],
      [{ deviceId: SOURCE_DEVICE_ID, publicKey: trustedSpki }],
    );

    const send = await encryptUtf8ToHybridSendPayload(plaintext, devices);

    expect(send.algorithm).toBe(MESSAGE_HYBRID_ALGORITHM);
    expect(Object.keys(send.encryptedMessageKeys).sort()).toEqual(
      [REMOTE_PEER_DEVICE_ID, SOURCE_DEVICE_ID].sort(),
    );
    expect(send.encryptedMessageKeys[NEW_DEVICE_ID]).toBeUndefined();

    /** Same identifiers the server emits on **`POST /users/me/devices`** → **`device:sync_requested`**. */
    const syncRequestedPayload: DeviceSyncRequestedPayload = {
      newDeviceId: NEW_DEVICE_ID,
      newDevicePublicKey: newSpki,
    };
    expect(syncRequestedPayload.newDeviceId.trim()).toBe(NEW_DEVICE_ID);

    const wrappedForSource = send.encryptedMessageKeys[SOURCE_DEVICE_ID];
    expect(wrappedForSource?.trim()?.length ?? 0).toBeGreaterThan(0);

    const msgKeyMaterial = await unwrapMessageKey(wrappedForSource, trustedKeys.privateKey);
    const wrappedForNewDevice = await wrapMessageKey(msgKeyMaterial, syncRequestedPayload.newDevicePublicKey);

    const messageId = 'msg-integration-second-browser';

    /** Batch **`POST`** body shape (**`usersApi.postBatchSyncMessageKeys`**) — what **`executeApproveDeviceKeySync`** sends. */
    const batchPostBody = {
      targetDeviceId: syncRequestedPayload.newDeviceId,
      keys: [{ messageId, encryptedMessageKey: wrappedForNewDevice }],
    };
    expect(JSON.stringify(batchPostBody)).not.toMatch(/PRIVATE KEY/i);

    const mergedMap = applyBatchSyncToEncryptedMessageKeys({
      encryptedMessageKeys: send.encryptedMessageKeys,
      targetDeviceId: batchPostBody.targetDeviceId,
      keys: batchPostBody.keys,
      messageId,
    });

    expect(Object.keys(mergedMap).sort()).toEqual(
      [NEW_DEVICE_ID, REMOTE_PEER_DEVICE_ID, SOURCE_DEVICE_ID].sort(),
    );
    expect(mergedMap[NEW_DEVICE_ID]?.trim()?.length ?? 0).toBeGreaterThan(0);

    const wire = {
      body: send.body,
      iv: send.iv,
      encryptedMessageKeys: mergedMap,
    };

    const asNewDevice = await decryptHybridMessageToUtf8(
      wire,
      NEW_DEVICE_ID,
      newKeys.privateKey,
    );
    expect(asNewDevice).toBe(plaintext);

    await expect(
      decryptHybridMessageToUtf8(
        {
          body: send.body,
          iv: send.iv,
          encryptedMessageKeys: send.encryptedMessageKeys,
        },
        NEW_DEVICE_ID,
        newKeys.privateKey,
      ),
    ).rejects.toThrow(/no wrapped key for this device/i);
  });
});
