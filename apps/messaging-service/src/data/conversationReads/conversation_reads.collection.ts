import type { Db } from 'mongodb';
import { logger } from '../../utils/logger.js';

/** MongoDB collection name — per-user read cursor per conversation (group “read up to” / Feature 12). */
export const CONVERSATION_READS_COLLECTION = 'conversation_reads';

/**
 * Durable **read cursor** for **`(userId, conversationId)`** — “I have read up to **`lastReadMessageId`**.”
 * **Delivered** state remains on **`messages.receiptsByUserId`** (or future paths); see
 * **`docs/PROJECT_PLAN.md` §14**.
 */
export type ConversationReadDocument = {
  userId: string;
  conversationId: string;
  /** Message **`id`** (UUID) — ordering vs other messages uses conversation list order, not string compare on id. */
  lastReadMessageId: string;
  lastReadAt: Date;
  updatedAt: Date;
};

/**
 * **`conversation_reads`** — indexes follow **`docs/PROJECT_PLAN.md` §14.2** (access-pattern-first).
 *
 * | Access pattern | Query shape | Index |
 * |----------------|-------------|--------|
 * | Latest read state for **me** in conversation **C** (badges, “read up to”) | `findOne({ userId, conversationId })` | `conversation_reads_user_conversation_unique` |
 * | List read cursors for **user** **U** (sync, settings) | `find({ userId }).sort({ lastReadAt: -1 })` | `conversation_reads_user_lastread` |
 *
 * Writes: **`updateOne`** with **`upsert`** + **`$set`** — idempotent for same cursor; callers enforce monotonic advance vs message order.
 */
export async function ensureConversationReadsIndexes(db: Db): Promise<void> {
  const col = db.collection(CONVERSATION_READS_COLLECTION);
  await col.createIndex(
    { userId: 1, conversationId: 1 },
    { unique: true, name: 'conversation_reads_user_conversation_unique' },
  );
  await col.createIndex(
    { userId: 1, lastReadAt: -1 },
    { name: 'conversation_reads_user_lastread' },
  );
  logger.info('MongoDB conversation_reads indexes ensured');
}
