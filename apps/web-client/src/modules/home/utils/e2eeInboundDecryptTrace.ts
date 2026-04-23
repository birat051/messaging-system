/**
 * ## Inbound E2EE display & decrypt trace (reproduce & document)
 *
 * ### UI resolution — **`resolveMessageDisplayBody`** (`messageDisplayBody.ts`)
 * - **Non-wire** messages (`!isMessageWireE2ee`): returns **`m.body`** as-is → **raw base64/ciphertext can
 *   appear** if the server stored ciphertext without legacy/hybrid wire markers.
 * - **Wire E2EE, peer row**: uses **`decryptedBodyByMessageId[id]`**; while **missing**, shows **`…`**
 *   (never the wire body for classified E2EE).
 * - **Wire E2EE, own row**: **`senderPlaintextByMessageId`** from this tab’s send; else **`decryptedBodyByMessageId`**
 *   after **`usePeerMessageDecryption`** unwraps an echo (**`encryptedMessageKeys[thisDeviceId]`**); else **`…`**.
 *
 * ### Inbound decrypt — **`usePeerMessageDecryption`** (`usePeerMessageDecryption.ts`)
 * Runs in **`HomeConversationShell`** for peer messages where **`isHybridE2eeMessage(m)`** (wire E2EE). Same crypto as
 * **`useDecryptMessage`** → **`decryptHybridMessageToUtf8`**
 * (`messageHybrid.ts`): **`encryptedMessageKeys[deviceId]`** → **`unwrapMessageKey`** → **`decryptMessageBody`**
 * (`messageKeyCrypto.ts`).
 *
 * | Condition | `decryptMessageBody` | Redux plaintext |
 * |-----------|---------------------|-----------------|
 * | No local ECDH private key | not reached | **`PEER_DECRYPT_NO_LOCAL_KEY`** (Feature 11 (B) copy) |
 * | Hybrid + no `deviceId` / no `encryptedMessageKeys[deviceId]` | not reached | **`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** |
 * | Unwrap or AES-GCM throws | (failed inside) | **`PEER_DECRYPT_CRYPTO_FAILED`** |
 * | Unclassified opaque **`body`** (heuristic) | n/a | **`PEER_DECRYPT_INLINE_UNAVAILABLE`** via **`resolveMessageDisplayBody`** |
 * | Success | runs | decrypted UTF-8 |
 *
 * **`useDecryptMessage`**: exposes **`decryptHybridForStoredDevice`** for the same **`decryptHybridMessageToUtf8`**
 * path; **inbound UI** uses **`usePeerMessageDecryption`** directly (not the hook).
 *
 * ### Device id — **`cryptoSlice`** / **`registerDevice`**, **`getStoredDeviceId`**
 * Hybrid receive requires **`deviceId`** from **`POST /users/me/devices`** persisted to IndexedDB so
 * **`encryptedMessageKeys[deviceId]`** can be resolved. **Bootstrap + realtime order:** **`e2eeReceiveTrace.ts`**.
 */

export {};
