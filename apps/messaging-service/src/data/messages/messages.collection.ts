import type { Db } from 'mongodb';
import { logger } from '../../utils/logger.js';

/** MongoDB collection name. */
export const MESSAGES_COLLECTION = 'messages';

/** Per-recipient delivery / seen timestamps on a message (**Feature 12** — see **`docs/MESSAGE_RECEIPTS_AND_READ_STATE_DESIGN.md`**). */
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
  createdAt: Date;
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
 * **`messages`** collection — indexes follow **`PROJECT_GUIDELINES.md`** (access-pattern-first).
 *
 * | Access pattern | Query shape | Index |
 * |----------------|-------------|--------|
 * | List messages in a thread, newest first + cursor (**`GET /conversations/{id}/messages`**) | `find({ conversationId, …cursor }).project(body…).sort({ createdAt: -1, id: -1 })` | `messages_conversation_created` |
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
  logger.info('MongoDB messages indexes ensured');
}
