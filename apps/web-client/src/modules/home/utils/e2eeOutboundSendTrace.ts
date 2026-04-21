/**
 * ## Outbound hybrid send path (Feature 11 wire shape)
 *
 * ### Client — **`useSendEncryptedMessage`** (`common/hooks/useSendEncryptedMessage.ts`)
 * 1. Load **recipient** + **sender** device rows via **`fetchDevicePublicKeys(userId)`** /
 * **`fetchDevicePublicKeys('me')`** → Redux **`devicePublicKeys`** ( **`GET /users/{id}/devices/public-keys`** ).
 * 2. **`mergeHybridDeviceRows(recipientRows, selfRows)`** — one wrapped key per **`deviceId`** (sender + recipient
 *    devices; duplicate **`deviceId`** last-write wins).
 * 3. **`encryptUtf8ToHybridSendPayload(plaintext, devices)`** (`messageHybrid.ts`):
 *    - **`generateMessageKey`**, **`encryptMessageBody`** → **`body`** (base64), **`iv`** (base64)
 *    - **`wrapMessageKey`** per device → **`encryptedMessageKeys[deviceId]`**
 *    - **`algorithm`:** **`MESSAGE_HYBRID_ALGORITHM`** (`aes-256-gcm+p256-hybrid-v1`)
 * 4. **`useSocketWorkerSendMessage`** → Socket.IO **`message:send`** with **`SendMessageRequest`**:
 *    **`body`**, **`iv`**, **`encryptedMessageKeys`**, **`algorithm`** (plus **`conversationId`** / **`recipientUserId`**).
 *
 * ### Server — **`sendMessageForUser`** (`messaging-service/src/data/messages/sendMessage.ts`) → **`insertMessage`**
 * Persists the same optional fields opaquely: **`encryptedMessageKeys`**, **`iv`**, **`algorithm`** (see **`repo.insertMessage`**).
 * No server-side parsing of ciphertext.
 *
 * ### Contract — **`docs/openapi/openapi.yaml`** **`SendMessageRequest`** / **`Message`**
 * - **`body`**: opaque (AES-GCM ciphertext for hybrid).
 * - **`iv`**, **`algorithm`**, **`encryptedMessageKeys`**: nullable on **`Message`**; hybrid sends include all three
 *   alongside non-empty **`encryptedMessageKeys`** map.
 *
 * If either side has **no** device rows, **`useSendEncryptedMessage`** throws (no plaintext send).
 */

export {};
