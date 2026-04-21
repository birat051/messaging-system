import type { Filter } from 'mongodb';
import { getDb } from '../db/mongo.js';
import { findConversationIdsForParticipant } from '../conversations/repo.js';
import { CONVERSATIONS_COLLECTION } from '../conversations/conversations.collection.js';
import { findUserDeviceRow } from '../userPublicKeys/repo.js';
import { AppError } from '../../utils/errors/AppError.js';
import { MAX_LIST_LIMIT } from '../../validation/limitQuery.js';
import { MESSAGES_COLLECTION, type MessageDocument } from './messages.collection.js';
import { findMessageById } from './repo.js';

export type SyncMessageKeyEntryApi = {
  messageId: string;
  encryptedMessageKey: string;
};

export type SyncMessageKeysListResponseApi = {
  items: SyncMessageKeyEntryApi[];
  hasMore: boolean;
  /** Pass as **`afterMessageId`** on the next page when **`hasMore`** is true. */
  nextAfterMessageId: string | null;
};

async function assertUserParticipantInConversation(
  userId: string,
  conversationId: string,
): Promise<void> {
  const doc = await getDb()
    .collection(CONVERSATIONS_COLLECTION)
    .findOne({ id: conversationId.trim() });
  const participants = doc?.participantIds;
  if (
    !Array.isArray(participants) ||
    !participants.some((p) => typeof p === 'string' && p === userId)
  ) {
    throw new AppError('FORBIDDEN', 403, 'Not allowed to access this conversation');
  }
}

/**
 * **`GET /users/me/sync/message-keys`** — paginated **`encryptedMessageKeys[deviceId]`** for messages in threads
 * the user participates in. Sort **`(createdAt asc, id asc)`**; **`afterMessageId`** is an exclusive lower bound on that order.
 */
export async function listSyncMessageKeysForUserDevice(params: {
  userId: string;
  deviceId: string;
  afterMessageId?: string | undefined;
  limit: number;
}): Promise<SyncMessageKeysListResponseApi> {
  const userId = params.userId.trim();
  const deviceId = params.deviceId.trim();
  if (userId.length === 0 || deviceId.length === 0) {
    throw new AppError('INVALID_REQUEST', 400, 'userId and deviceId are required');
  }

  const deviceRow = await findUserDeviceRow(userId, deviceId);
  if (!deviceRow) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'deviceId is not a registered device for this user',
    );
  }

  const conversationIds = await findConversationIdsForParticipant(userId);

  if (conversationIds.length === 0) {
    return { items: [], hasMore: false, nextAfterMessageId: null };
  }

  const cap = Math.min(Math.max(1, params.limit), MAX_LIST_LIMIT);
  const fetchLimit = cap + 1;

  const emkPath = `encryptedMessageKeys.${deviceId}`;
  const emkExists: Record<string, unknown> = {
    [emkPath]: { $exists: true, $nin: [null, ''] },
  };

  let anchor: MessageDocument | null = null;
  if (params.afterMessageId !== undefined && params.afterMessageId.length > 0) {
    anchor = await findMessageById(params.afterMessageId);
    if (!anchor) {
      throw new AppError('NOT_FOUND', 404, 'afterMessageId not found');
    }
    await assertUserParticipantInConversation(userId, anchor.conversationId);
    const wrapped = anchor.encryptedMessageKeys?.[deviceId];
    if (typeof wrapped !== 'string' || wrapped.length === 0) {
      throw new AppError(
        'INVALID_REQUEST',
        400,
        'Cursor message has no wrapped key for this device',
      );
    }
  }

  const col = getDb().collection<MessageDocument>(MESSAGES_COLLECTION);

  const baseParts: Filter<MessageDocument>[] = [
    { conversationId: { $in: conversationIds } } as Filter<MessageDocument>,
    emkExists as Filter<MessageDocument>,
  ];
  if (anchor) {
    baseParts.push({
      $or: [
        { createdAt: { $gt: anchor.createdAt } },
        { createdAt: anchor.createdAt, id: { $gt: anchor.id } },
      ],
    } as Filter<MessageDocument>);
  }

  const filter: Filter<MessageDocument> = { $and: baseParts };

  const projection: Record<string, 0 | 1> = {
    _id: 0,
    id: 1,
    createdAt: 1,
    [emkPath]: 1,
  };

  const docs = await col
    .find(filter)
    .project(projection)
    .sort({ createdAt: 1, id: 1 })
    .limit(fetchLimit)
    .toArray();

  const hasMore = docs.length > cap;
  const slice = hasMore ? docs.slice(0, cap) : docs;

  const items: SyncMessageKeyEntryApi[] = [];
  for (const raw of slice) {
    const doc = raw as MessageDocument & Record<string, unknown>;
    const messageId = doc.id;
    const keyVal = doc.encryptedMessageKeys?.[deviceId];
    if (typeof messageId !== 'string' || typeof keyVal !== 'string') {
      continue;
    }
    items.push({ messageId, encryptedMessageKey: keyVal });
  }

  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextAfterMessageId: hasMore && last ? last.messageId : null,
  };
}

export type BatchKeyUploadResponseApi = {
  applied: number;
  skipped: number;
};

/**
 * **`POST /users/me/sync/message-keys`** — sets **`encryptedMessageKeys[targetDeviceId]`** on each message where the
 * caller already has **`encryptedMessageKeys[sourceDeviceId]`** and the message is in a conversation they belong to.
 */
export async function applyBatchSyncMessageKeys(params: {
  userId: string;
  sourceDeviceId: string;
  targetDeviceId: string;
  keys: Array<{ messageId: string; encryptedMessageKey: string }>;
}): Promise<BatchKeyUploadResponseApi> {
  const userId = params.userId.trim();
  const sourceDeviceId = params.sourceDeviceId.trim();
  const targetDeviceId = params.targetDeviceId.trim();
  if (
    userId.length === 0 ||
    sourceDeviceId.length === 0 ||
    targetDeviceId.length === 0
  ) {
    throw new AppError('INVALID_REQUEST', 400, 'Missing user or device id');
  }

  if (!(await findUserDeviceRow(userId, targetDeviceId))) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'targetDeviceId is not a registered device for this user',
    );
  }

  if (!(await findUserDeviceRow(userId, sourceDeviceId))) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'sourceDeviceId is not a registered device for this user',
    );
  }

  const conversationIds = await findConversationIdsForParticipant(userId);
  if (conversationIds.length === 0) {
    return { applied: 0, skipped: params.keys.length };
  }

  const lastByMessage = new Map<
    string,
    { messageId: string; encryptedMessageKey: string }
  >();
  for (const k of params.keys) {
    const mid = k.messageId.trim();
    lastByMessage.set(mid, {
      messageId: mid,
      encryptedMessageKey: k.encryptedMessageKey,
    });
  }
  const uniqueKeys = [...lastByMessage.values()];

  const col = getDb().collection<MessageDocument>(MESSAGES_COLLECTION);
  let applied = 0;
  let skipped = 0;
  const setPath = `encryptedMessageKeys.${targetDeviceId}`;
  const sourcePath = `encryptedMessageKeys.${sourceDeviceId}`;

  for (const { messageId, encryptedMessageKey } of uniqueKeys) {
    const res = await col.updateOne(
      {
        id: messageId,
        conversationId: { $in: conversationIds },
        [sourcePath]: { $exists: true, $nin: [null, ''] },
      } as Filter<MessageDocument>,
      { $set: { [setPath]: encryptedMessageKey } },
    );
    if (res.matchedCount === 1) {
      applied += 1;
    } else {
      skipped += 1;
    }
  }

  return { applied, skipped };
}
