import { randomUUID } from 'node:crypto';
import { MongoServerError } from 'mongodb';
import { getDb } from '../db/mongo.js';
import { CONVERSATIONS_COLLECTION } from './constants.js';
import type { DirectConversationDocument } from './types.js';

export function directPairKey(userA: string, userB: string): string {
  return [userA, userB].sort().join('|');
}

/**
 * Returns the conversation **`id`** for an existing direct thread between two users, or **`null`** if none.
 */
export async function findDirectConversationIdBetween(
  userA: string,
  userB: string,
): Promise<string | null> {
  if (userA === userB) {
    return null;
  }
  const key = directPairKey(userA, userB);
  const doc = await getDb()
    .collection<DirectConversationDocument>(CONVERSATIONS_COLLECTION)
    .findOne({ directPairKey: key, isGroup: false });
  return doc?.id ?? null;
}

export type ConversationLookup =
  | { kind: 'direct'; doc: DirectConversationDocument }
  | { kind: 'group' };

/**
 * Resolves a conversation by **`id`** for send flows — distinguishes **direct** vs **group** rows.
 */
export async function lookupConversationById(
  conversationId: string,
): Promise<ConversationLookup | null> {
  const trimmed = conversationId.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const doc = await getDb()
    .collection(CONVERSATIONS_COLLECTION)
    .findOne({ id: trimmed });
  if (!doc) {
    return null;
  }
  if (doc.isGroup === true) {
    return { kind: 'group' };
  }
  return {
    kind: 'direct',
    doc: doc as unknown as DirectConversationDocument,
  };
}

/**
 * Loads or creates a **direct 1:1** conversation between two distinct users.
 */
export async function findOrCreateDirectConversation(
  userA: string,
  userB: string,
): Promise<DirectConversationDocument> {
  const col = getDb().collection<DirectConversationDocument>(CONVERSATIONS_COLLECTION);
  const existingId = await findDirectConversationIdBetween(userA, userB);
  if (existingId) {
    const existing = await col.findOne({ id: existingId });
    if (existing) {
      return existing;
    }
  }

  const id = randomUUID();
  const key = directPairKey(userA, userB);
  const [p0, p1] = [userA, userB].sort() as [string, string];
  const now = new Date();
  const doc: DirectConversationDocument = {
    id,
    directPairKey: key,
    participantIds: [p0, p1],
    isGroup: false,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await col.insertOne(doc);
  } catch (err: unknown) {
    if (err instanceof MongoServerError && err.code === 11000) {
      const retryId = await findDirectConversationIdBetween(userA, userB);
      if (retryId) {
        const retryDoc = await col.findOne({ id: retryId });
        if (retryDoc) {
          return retryDoc;
        }
      }
    }
    throw err;
  }
  return doc;
}
