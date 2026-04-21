import type { Db } from 'mongodb';
import { logger } from '../../utils/logger.js';

/** MongoDB collection name. */
export const MESSAGES_COLLECTION = 'messages';

/** Per-recipient delivery / seen timestamps on a message (**Feature 12** — see **`docs/PROJECT_PLAN.md` §14**). */
export type MessageReceiptEntry = {
  deliveredAt?: Date;
  seenAt?: Date;
};

/** Projection row for **`GET /conversations/{id}/message-receipts`** (no body / media / sender). */
export type MessageReceiptListRow = {
  id: string;
  conversationId: string;
  createdAt: Date;
  receiptsByUserId?: Record<string, MessageReceiptEntry>;
};

export type MessageDocument = {
  id: string;
  conversationId: string;
  senderId: string;
  /** Plaintext or opaque E2EE ciphertext; server never decrypts (`docs/openapi/openapi.yaml` **Message.body**). */
  body: string | null;
  mediaKey: string | null;
  /**
   * Per-device wrapped message keys (hybrid E2EE) — opaque base64 strings; server does not unwrap.
   * **Sparse map:** BSON allows arbitrary device-id keys; new devices are added with **`$set: { ['encryptedMessageKeys.<id>']: … }`**
   * without rewriting the whole object (see **`applyBatchSyncMessageKeys`**).
   * @see `docs/PROJECT_PLAN.md` §7.1
   */
  encryptedMessageKeys?: Record<string, string>;
  /** AES-GCM IV/nonce for **`body`** when E2EE; opaque to the server. */
  iv?: string | null;
  /**
   * Client algorithm label for **`body`** / **`encryptedMessageKeys`** (e.g. **`aes-256-gcm+p256-hybrid-v1`**).
   * Opaque to the server — never interpreted or validated beyond storage.
   */
  algorithm?: string | null;
  createdAt: Date;
  /** Guest-only guest↔guest sends — MongoDB TTL when enabled. */
  guestDataExpiresAt?: Date;
  /**
   * **1:1** (one peer) or **group** per-member receipt materialization — user id → delivery/read times.
   * **Read-up-to** for groups may also use **`conversation_reads`** to avoid O(N) message updates.
   *
   * **Shipped with Feature 1–compatible message rows:** omitted on **`insertMessage`** until first receipt write
   * (avoids a later **Feature 12** document-shape migration for optional embedded maps).
   */
  receiptsByUserId?: Record<string, MessageReceiptEntry>;
};

/**
 * **`messages`** collection — indexes follow **`docs/PROJECT_PLAN.md` §14** (access-pattern-first).
 *
 * | Access pattern | Query shape | Index |
 * |----------------|-------------|--------|
 * | List messages in a thread, newest first + cursor (**`GET /conversations/{id}/messages`**) | `find({ conversationId, …cursor }).project(body…).sort({ createdAt: -1, id: -1 })` | `messages_conversation_created` |
 * | Per-device wrapped keys across threads (**`GET /users/me/sync/message-keys`**) | `find({ conversationId: { $in }, encryptedMessageKeys.<deviceId> exists, cursor }).sort({ createdAt: 1, id: 1 })` | *(same compound index per conversationId)* |
 * | Receipt-only rows, same cursor (**`GET /conversations/{id}/message-receipts`**) | `find(…).project(id, createdAt, receiptsByUserId).sort(…)` | *(same compound index)* |
 * | Lookup by primary key (send pipeline, receipt **`$set`** on nested path) | `findOne({ id })` / `updateOne({ id }, …)` | `messages_id_unique` |
 * | Receipts for message **M** | Embedded **`receiptsByUserId`** on the message doc (no separate collection) | *(none — hot path is primary key)* |
 *
 * **`createIndex`** is idempotent — greenfield DB only.
 */
export async function ensureMessageIndexes(db: Db): Promise<void> {
  const col = db.collection(MESSAGES_COLLECTION);
  await col.createIndex(
    { conversationId: 1, createdAt: -1, id: -1 },
    { name: 'messages_conversation_created' },
  );
  await col.createIndex({ id: 1 }, { unique: true, name: 'messages_id_unique' });
  await col.createIndex(
    { guestDataExpiresAt: 1 },
    {
      name: 'messages_guest_data_ttl',
      expireAfterSeconds: 0,
      sparse: true,
    },
  );
  logger.info('MongoDB messages indexes ensured');
}
