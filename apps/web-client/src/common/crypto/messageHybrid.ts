/**
 * Per-device **hybrid** E2EE: random **AES-256-GCM** message key → **`body`** + **`iv`**; wrap the message key
 * for each target device with **P-256 ECDH + HKDF + AES-256-GCM** (`docs/PROJECT_PLAN.md` §7.1).
 */

import { arrayBufferToBase64, base64ToArrayBuffer } from './encoding';
import {
  decryptMessageBody,
  encryptMessageBody,
  generateMessageKey,
  wrapMessageKey,
  unwrapMessageKey,
} from './messageKeyCrypto';

/** Wire tag for **`Message.algorithm`** / **`SendMessageRequest.algorithm`** — server stores opaquely. */
export const MESSAGE_HYBRID_ALGORITHM = 'aes-256-gcm+p256-hybrid-v1' as const;

function uint8ArrayToBase64(u: Uint8Array): string {
  const copy = new Uint8Array(u.byteLength);
  copy.set(u);
  return arrayBufferToBase64(copy.buffer);
}

export type HybridDeviceRow = {
  deviceId: string;
  /** SPKI Base64 — same as device registry. */
  publicKey: string;
};

/** Union of device lists (e.g. self + peer) by **`deviceId`** — last duplicate **`deviceId` wins**. */
export function mergeHybridDeviceRows(
  ...lists: HybridDeviceRow[][]
): HybridDeviceRow[] {
  const map = new Map<string, HybridDeviceRow>();
  for (const list of lists) {
    for (const row of list) {
      const id = row.deviceId.trim();
      if (id.length === 0) {
        continue;
      }
      map.set(id, { deviceId: id, publicKey: row.publicKey });
    }
  }
  return [...map.values()];
}

/**
 * Encrypt **`plaintext`** for **`devices`** (recipient + sender devices). Implements hybrid steps **2–4**:
 * **`generateMessageKey`**, **`encryptMessageBody`**, **`wrapMessageKey`** per row (**`messageKeyCrypto`**).
 * **`body`** / **`iv`** are Base64 on the wire.
 *
 * Outbound pipeline and persistence: **`e2eeOutboundSendTrace.ts`**.
 */
export async function encryptUtf8ToHybridSendPayload(
  plaintext: string,
  devices: HybridDeviceRow[],
): Promise<{
  algorithm: typeof MESSAGE_HYBRID_ALGORITHM;
  body: string;
  iv: string;
  encryptedMessageKeys: Record<string, string>;
}> {
  if (devices.length === 0) {
    throw new Error('At least one device public key is required for hybrid encryption');
  }
  const msgKeyRaw = await generateMessageKey();
  const { ciphertext, iv } = await encryptMessageBody(msgKeyRaw, plaintext);

  const encryptedMessageKeys: Record<string, string> = {};
  for (const d of devices) {
    encryptedMessageKeys[d.deviceId] = await wrapMessageKey(
      msgKeyRaw,
      d.publicKey,
    );
  }

  return {
    algorithm: MESSAGE_HYBRID_ALGORITHM,
    body: uint8ArrayToBase64(ciphertext),
    iv: uint8ArrayToBase64(iv),
    encryptedMessageKeys,
  };
}

/** Hybrid **`algorithm`** + **`encryptedMessageKeys`** + **`iv`** — wire ciphertext, not display text. */
export function isMessageWireE2ee(m: {
  body?: string | null;
  algorithm?: string | null;
  encryptedMessageKeys?: Record<string, string> | null;
  iv?: string | null;
}): boolean {
  return isHybridE2eeMessage(m);
}

/** True when **`m`** uses the per-device hybrid envelope. */
export function isHybridE2eeMessage(m: {
  body?: string | null;
  algorithm?: string | null;
  encryptedMessageKeys?: Record<string, string> | null;
  iv?: string | null;
}): boolean {
  return (
    m.algorithm === MESSAGE_HYBRID_ALGORITHM &&
    m.encryptedMessageKeys != null &&
    Object.keys(m.encryptedMessageKeys).length > 0 &&
    typeof m.iv === 'string' &&
    m.iv.trim().length > 0 &&
    typeof m.body === 'string' &&
    m.body.trim().length > 0
  );
}

/**
 * Decrypt **`body`** for this device: **`unwrapMessageKey`** → **`decryptMessageBody`** (hybrid receive steps **7–8**).
 * Inbound path: **`usePeerMessageDecryption`**. Trace: **`e2eeInboundDecryptTrace.ts`** (web-client).
 */
export async function decryptHybridMessageToUtf8(
  params: {
    body: string;
    iv: string;
    encryptedMessageKeys: Record<string, string>;
  },
  deviceId: string,
  recipientPrivateKey: CryptoKey,
): Promise<string> {
  const wrapped = params.encryptedMessageKeys[deviceId];
  if (!wrapped?.trim()) {
    throw new Error('No wrapped key for this device');
  }
  const msgKeyRaw = await unwrapMessageKey(wrapped, recipientPrivateKey);
  const ivBody = new Uint8Array(base64ToArrayBuffer(params.iv));
  const ct = new Uint8Array(base64ToArrayBuffer(params.body));
  return decryptMessageBody(msgKeyRaw, ct, ivBody);
}
