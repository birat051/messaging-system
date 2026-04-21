import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import { getDb } from '../../data/db/mongo.js';
import { CONVERSATIONS_COLLECTION } from '../../data/conversations/conversations.collection.js';
import type { MessageListCursor } from './messageCursor.js';
import {
  MESSAGES_COLLECTION,
  type MessageDocument,
  type MessageReceiptListRow,
} from './messages.collection.js';
import { MAX_LIST_LIMIT } from '../../validation/limitQuery.js';

export async function insertMessage(params: {
  conversationId: string;
  senderId: string;
  body: string | null;
  mediaKey: string | null;
  encryptedMessageKeys?: Record<string, string>;
  iv?: string | null;
  algorithm?: string | null;
  guestDataExpiresAt?: Date;
}): Promise<MessageDocument> {
  const id = randomUUID();
  const now = new Date();
  const doc: MessageDocument = {
    id,
    conversationId: params.conversationId,
    senderId: params.senderId,
    body: params.body,
    mediaKey: params.mediaKey,
    createdAt: now,
    ...(params.encryptedMessageKeys !== undefined
      ? { encryptedMessageKeys: params.encryptedMessageKeys }
      : {}),
    ...(params.iv !== undefined ? { iv: params.iv } : {}),
    ...(params.algorithm !== undefined ? { algorithm: params.algorithm } : {}),
    ...(params.guestDataExpiresAt !== undefined
      ? { guestDataExpiresAt: params.guestDataExpiresAt }
      : {}),
  };
  await getDb().collection<MessageDocument>(MESSAGES_COLLECTION).insertOne(doc);
  await getDb().collection(CONVERSATIONS_COLLECTION).updateOne(
    { id: params.conversationId },
    { $set: { updatedAt: now } },
  );
  return doc;
}

export async function findMessageById(
  messageId: string,
): Promise<MessageDocument | null> {
  return getDb()
    .collection<MessageDocument>(MESSAGES_COLLECTION)
    .findOne({ id: messageId.trim() });
}

/**
 * **Idempotent:** if **`deliveredAt`** is already set to the same or a later time, returns **`changed: false`**.
 */
export async function setReceiptDelivered(params: {
  messageId: string;
  conversationId: string;
  userId: string;
  at: Date;
}): Promise<
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'not_found' | 'conversation_mismatch' }
> {
  const col = getDb().collection<MessageDocument>(MESSAGES_COLLECTION);
  const msg = await col.findOne({ id: params.messageId });
  if (!msg) {
    return { ok: false, reason: 'not_found' };
  }
  if (msg.conversationId !== params.conversationId) {
    return { ok: false, reason: 'conversation_mismatch' };
  }
  const prev = msg.receiptsByUserId?.[params.userId]?.deliveredAt;
  if (prev !== undefined && prev.getTime() >= params.at.getTime()) {
    return { ok: true, changed: false };
  }
  await col.updateOne(
    { id: params.messageId },
    { $set: { [`receiptsByUserId.${params.userId}.deliveredAt`]: params.at } },
  );
  return { ok: true, changed: true };
}

/**
 * **Idempotent:** if **`seenAt`** is already set to the same or a later time, returns **`changed: false`**.
 */
export async function setReceiptSeen(params: {
  messageId: string;
  conversationId: string;
  userId: string;
  at: Date;
}): Promise<
  | { ok: true; changed: boolean }
  | { ok: false; reason: 'not_found' | 'conversation_mismatch' }
> {
  const col = getDb().collection<MessageDocument>(MESSAGES_COLLECTION);
  const msg = await col.findOne({ id: params.messageId });
  if (!msg) {
    return { ok: false, reason: 'not_found' };
  }
  if (msg.conversationId !== params.conversationId) {
    return { ok: false, reason: 'conversation_mismatch' };
  }
  const prev = msg.receiptsByUserId?.[params.userId]?.seenAt;
  if (prev !== undefined && prev.getTime() >= params.at.getTime()) {
    return { ok: true, changed: false };
  }
  await col.updateOne(
    { id: params.messageId },
    { $set: { [`receiptsByUserId.${params.userId}.seenAt`]: params.at } },
  );
  return { ok: true, changed: true };
}

function buildConversationMessagesFilter(
  conversationId: string,
  cursor: MessageListCursor | undefined,
): Filter<MessageDocument> {
  const filter: Filter<MessageDocument> = { conversationId };
  if (cursor) {
    filter.$or = [
      { createdAt: { $lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, id: { $lt: cursor.id } },
    ];
  }
  return filter;
}

/**
 * Keyset list for **`conversationId`**, **newest first** (`createdAt` desc, **`id`** desc). **`cursor`**
 * is exclusive: returns messages strictly older than the boundary.
 */
export async function listMessagesByConversation(params: {
  conversationId: string;
  limit: number;
  cursor?: MessageListCursor | undefined;
}): Promise<{ items: MessageDocument[]; hasMore: boolean }> {
  const col = getDb().collection<MessageDocument>(MESSAGES_COLLECTION);
  const cap = Math.min(Math.max(1, params.limit), MAX_LIST_LIMIT);
  const fetchLimit = cap + 1;

  const filter = buildConversationMessagesFilter(
    params.conversationId,
    params.cursor,
  );

  const docs = await col
    .find(filter)
    .project({
      id: 1,
      conversationId: 1,
      senderId: 1,
      body: 1,
      mediaKey: 1,
      /** Hybrid E2EE — required for client decrypt after REST hydrate (`messageDocumentToApi`, OpenAPI **Message**). */
      encryptedMessageKeys: 1,
      iv: 1,
      algorithm: 1,
      createdAt: 1,
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(fetchLimit)
    .toArray();

  const hasMore = docs.length > cap;
  const items = hasMore ? docs.slice(0, cap) : docs;
  return { items: items as MessageDocument[], hasMore };
}

/**
 * Same pagination as **`listMessagesByConversation`** but projects only **`id`**, **`conversationId`**,
 * **`createdAt`**, **`receiptsByUserId`** — for **`GET /conversations/{id}/message-receipts`**.
 */
export async function listMessageReceiptSummariesByConversation(params: {
  conversationId: string;
  limit: number;
  cursor?: MessageListCursor | undefined;
}): Promise<{ items: MessageReceiptListRow[]; hasMore: boolean }> {
  const col = getDb().collection<MessageDocument>(MESSAGES_COLLECTION);
  const cap = Math.min(Math.max(1, params.limit), MAX_LIST_LIMIT);
  const fetchLimit = cap + 1;

  const filter = buildConversationMessagesFilter(
    params.conversationId,
    params.cursor,
  );

  const docs = await col
    .find(filter)
    .project({
      id: 1,
      conversationId: 1,
      createdAt: 1,
      receiptsByUserId: 1,
    })
    .sort({ createdAt: -1, id: -1 })
    .limit(fetchLimit)
    .toArray();

  const hasMore = docs.length > cap;
  const slice = hasMore ? docs.slice(0, cap) : docs;
  return { items: slice as MessageReceiptListRow[], hasMore };
}
