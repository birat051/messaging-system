import { getDb } from '../db/mongo.js';
import {
  CONVERSATION_READS_COLLECTION,
  type ConversationReadDocument,
} from './conversation_reads.collection.js';

/**
 * Upsert read cursor — **idempotent** for retries; **business rules** (only advance when the new
 * message is after the old cursor in thread order) belong in the service layer.
 *
 * **`changed`:** **`false`** when the document already matched the same values (duplicate event).
 */
export async function upsertConversationRead(params: {
  userId: string;
  conversationId: string;
  lastReadMessageId: string;
  lastReadAt: Date;
}): Promise<{ doc: ConversationReadDocument; changed: boolean }> {
  const now = new Date();
  const col = getDb().collection<ConversationReadDocument>(
    CONVERSATION_READS_COLLECTION,
  );
  const result = await col.updateOne(
    { userId: params.userId, conversationId: params.conversationId },
    {
      $set: {
        lastReadMessageId: params.lastReadMessageId,
        lastReadAt: params.lastReadAt,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: params.userId,
        conversationId: params.conversationId,
      },
    },
    { upsert: true },
  );
  const doc = await col.findOne({
    userId: params.userId,
    conversationId: params.conversationId,
  });
  if (!doc) {
    throw new Error('upsertConversationRead: missing document after upsert');
  }
  const changed =
    (result.upsertedCount ?? 0) > 0 || (result.modifiedCount ?? 0) > 0;
  return { doc, changed };
}

export async function findConversationReadByUserAndConversation(params: {
  userId: string;
  conversationId: string;
}): Promise<ConversationReadDocument | null> {
  return getDb()
    .collection<ConversationReadDocument>(CONVERSATION_READS_COLLECTION)
    .findOne({
      userId: params.userId,
      conversationId: params.conversationId,
    });
}
