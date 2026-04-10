import { randomUUID } from 'node:crypto';
import { getDb } from '../db/mongo.js';
import { CONVERSATIONS_COLLECTION } from '../conversations/constants.js';
import { MESSAGES_COLLECTION } from './constants.js';
import type { MessageDocument } from './types.js';

export async function insertMessage(params: {
  conversationId: string;
  senderId: string;
  body: string | null;
  mediaKey: string | null;
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
  };
  await getDb().collection<MessageDocument>(MESSAGES_COLLECTION).insertOne(doc);
  await getDb().collection(CONVERSATIONS_COLLECTION).updateOne(
    { id: params.conversationId },
    { $set: { updatedAt: now } },
  );
  return doc;
}
