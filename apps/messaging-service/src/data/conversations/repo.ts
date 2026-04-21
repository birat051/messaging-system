import { randomUUID } from 'node:crypto';
import type { Filter } from 'mongodb';
import { MongoServerError } from 'mongodb';
import { getDb } from '../../data/db/mongo.js';
import { MAX_LIST_LIMIT } from '../../validation/limitQuery.js';
import type { ConversationListCursor } from './conversationCursor.js';
import {
  CONVERSATIONS_COLLECTION,
  type DirectConversationDocument,
} from './conversations.collection.js';

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
 * **`guestDataExpiresAt`** is set on **new** guest↔guest threads when TTL is enabled (see **`sendMessage.ts`**).
 */
export async function findOrCreateDirectConversation(
  userA: string,
  userB: string,
  guestDataExpiresAt?: Date,
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
    ...(guestDataExpiresAt !== undefined
      ? { guestDataExpiresAt }
      : {}),
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

function buildParticipantConversationsFilter(
  userId: string,
  cursor: ConversationListCursor | undefined,
): Filter<DirectConversationDocument> {
  const filter: Filter<DirectConversationDocument> = {
    participantIds: userId,
    isGroup: false,
  };
  if (cursor) {
    filter.$or = [
      { updatedAt: { $lt: cursor.updatedAt } },
      { updatedAt: cursor.updatedAt, id: { $lt: cursor.id } },
    ];
  }
  return filter;
}

/**
 * **Direct 1:1** threads for **`userId`**, **newest activity first** (`updatedAt` desc, **`id`** desc). **`cursor`**
 * is exclusive: returns rows strictly older than the boundary.
 */
export async function listDirectConversationsForParticipant(params: {
  userId: string;
  limit: number;
  cursor?: ConversationListCursor | undefined;
}): Promise<{ items: DirectConversationDocument[]; hasMore: boolean }> {
  const col = getDb().collection<DirectConversationDocument>(CONVERSATIONS_COLLECTION);
  const cap = Math.min(Math.max(1, params.limit), MAX_LIST_LIMIT);
  const fetchLimit = cap + 1;

  const filter = buildParticipantConversationsFilter(
    params.userId,
    params.cursor,
  );

  const docs = await col
    .find(filter)
    .project({
      id: 1,
      directPairKey: 1,
      participantIds: 1,
      isGroup: 1,
      createdAt: 1,
      updatedAt: 1,
    })
    .sort({ updatedAt: -1, id: -1 })
    .limit(fetchLimit)
    .toArray();

  const hasMore = docs.length > cap;
  const items = hasMore ? docs.slice(0, cap) : docs;
  return { items: items as DirectConversationDocument[], hasMore };
}

/** All conversation ids where **`userId`** appears in **`participantIds`** (direct and future group rows). */
export async function findConversationIdsForParticipant(
  userId: string,
): Promise<string[]> {
  const uid = userId.trim();
  if (uid.length === 0) {
    return [];
  }
  const docs = await getDb()
    .collection(CONVERSATIONS_COLLECTION)
    .find({ participantIds: uid }, { projection: { _id: 0, id: 1 } })
    .toArray();
  return docs
    .map((d) => (d as { id?: unknown }).id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
}
