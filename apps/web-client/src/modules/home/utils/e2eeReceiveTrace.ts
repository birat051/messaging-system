/**
 * ## Inbound decrypt path (REST + realtime + device bootstrap)
 *
 * ### Message arrival
 * - **REST:** **`useConversation`** / SWR **`['conversation-messages', conversationId, userId]`** hydrates
 *   **`hydrateMessagesFromFetch`** → **`messagesById`** (includes **`body`**, **`iv`**, **`algorithm`**, **`encryptedMessageKeys`**).
 * - **Socket.IO `message:new`:** **`SocketWorkerProvider`** → **`appendIncomingMessageIfNew`**, then
 *   **`mutate(['conversation-messages', …])`** so lists stay fresh.
 *
 * ### Decrypt (**`usePeerMessageDecryption`** on **`HomeConversationShell`**)
 * Runs when **`conversationId`**, **`messageIds`**, peer payload signature, or **`crypto.deviceId`** change.
 * **`loadMessagingEcdhPrivateKey`** → **`getStoredDeviceId`** (IndexedDB **`deviceIdentity`**, mirrored from
 * **`ensureUserKeypairReadyForMessaging`** / **`registerDevice`**) → **`decryptHybridMessageToUtf8`** →
 * **`setPeerDecryptedBody`**.
 *
 * ### Bootstrap / **`deviceId`** before decrypt
 * - **`ensureUserKeypairReadyForMessaging`** (login / **`SessionRestore`**) persists **`deviceId`** and dispatches
 *   **`hydrateMessagingDeviceId`**. Until then, hybrid decrypt may cache **`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`**;
 *   **`shouldRetryPeerDecryptAfterCachedFailure`** allows a **retry** once **`deviceId`** exists (**`peerDecryptRetry.ts`**).
 * - **`device_sync_complete`** + **`revalidateConversationMessagesForUser`** refetch messages so
 *   **`encryptedMessageKeys`** maps include this device after multi-device sync (**`SocketWorkerProvider`**).
 *
 * ### Trace / debug
 * - Inbound display: **`e2eeInboundDecryptTrace.ts`**
 * - **`VITE_DEBUG_PEER_DECRYPT=true`** — branch logging in **`usePeerMessageDecryption`**
 */

export {};
