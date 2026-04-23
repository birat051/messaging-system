/**
 * Copy + detection for **inbound** decrypt failures shown inline in the thread (not Settings).
 * **Feature 11 (B)** — primary line: **“Can’t decrypt on this device.”**
 * Missing-map copy aligns with **`docs/PROJECT_PLAN.md` §7.1** (*Actual new device or wiped profile* / *Multi-device Sync*).
 */

/** Shared Feature 11 (B) line — also used when wire shape is missing but **`body`** looks like ciphertext. */
export const PEER_DECRYPT_INLINE_UNAVAILABLE = "Can't decrypt on this device.";

/** **`encryptedMessageKeys`** has no wrapped key for this browser’s **`deviceId`** (historical ciphertext without Feature 13). */
export const PEER_DECRYPT_NO_DEVICE_KEY_ENTRY =
  "Can't decrypt older messages here without multi-device sync from another trusted device. New messages encrypted for this device still work.";

/** Local ECDH private key / keyring is not available (e.g. fresh browser profile). */
export const PEER_DECRYPT_NO_LOCAL_KEY =
  "Can't decrypt on this device. No encryption key for this browser.";

/** Wrapped key present but unwrap/decrypt failed (corrupt payload, wrong key, etc.). */
export const PEER_DECRYPT_CRYPTO_FAILED =
  "Can't decrypt on this device. The ciphertext could not be decoded.";

const INLINE_ERROR_MESSAGES = new Set<string>([
  PEER_DECRYPT_INLINE_UNAVAILABLE,
  PEER_DECRYPT_NO_DEVICE_KEY_ENTRY,
  PEER_DECRYPT_NO_LOCAL_KEY,
  PEER_DECRYPT_CRYPTO_FAILED,
]);

/** True when **`text`** is a known decrypt-failure line for **`ThreadMessageList`** styling. */
export function isPeerDecryptInlineError(text: string): boolean {
  return INLINE_ERROR_MESSAGES.has(text.trim());
}

/** Sidebar / list preview — avoid showing long error copy for E2EE rows. */
export function neutralizeDecryptErrorForListPreview(display: string): string {
  return isPeerDecryptInlineError(display) ? 'Encrypted message' : display;
}
