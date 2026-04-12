import { AppError } from '../../utils/errors/AppError.js';
import {
  findOrCreateDirectConversation,
  lookupConversationById,
} from '../../data/conversations/repo.js';
import type { DirectConversationDocument } from '../../data/conversations/conversations.collection.js';
import { publishMessage } from '../../data/messaging/rabbitmq.js';
import { findUserById } from '../../data/users/repo.js';
import type { SendMessageRequest } from '../../validation/schemas.js';
import { messageDocumentToApi } from './messageApiShape.js';
import { insertMessage } from './repo.js';
import type { MessageDocument } from './messages.collection.js';

function normalizeBodyText(body: SendMessageRequest['body']): string | null {
  if (body === undefined || body === null) {
    return null;
  }
  const t = String(body).trim();
  return t.length === 0 ? null : t;
}

function normalizeMediaKey(
  media: SendMessageRequest['mediaKey'],
): string | null {
  if (media === undefined || media === null) {
    return null;
  }
  const t = String(media).trim();
  return t.length === 0 ? null : t;
}

/** Broker publishes for recipient + sender echo (other devices); see `skipSocketId` in `rabbitmq.ts`. */
async function insertDirectMessageAndPublish(
  recipientUserId: string,
  params: {
    conversationId: string;
    senderId: string;
    body: string | null;
    mediaKey: string | null;
  },
  options?: { originSocketId?: string },
): Promise<MessageDocument> {
  const doc = await insertMessage(params);
  const api = messageDocumentToApi(doc);
  await publishMessage(`message.user.${recipientUserId}`, api);
  await publishMessage(`message.user.${params.senderId}`, {
    message: api,
    skipSocketId: options?.originSocketId,
  });
  return doc;
}

/**
 * Persists a message for **`POST /messages`** — **direct 1:1** only; **group** threads return **403**.
 *
 * **`body`:** Stored as an opaque string. When clients use E2EE, **`body`** is ciphertext; the service does not decrypt.
 * That feature **depends on** user-level public-key APIs and **Prerequisite — User keypair** (`docs/TASK_CHECKLIST.md`).
 */
export async function sendMessageForUser(
  senderId: string,
  payload: SendMessageRequest,
  options?: { originSocketId?: string },
): Promise<MessageDocument> {
  const text = normalizeBodyText(payload.body);
  const mediaKey = normalizeMediaKey(payload.mediaKey);

  const convRaw =
    payload.conversationId !== undefined && payload.conversationId !== null
      ? String(payload.conversationId).trim()
      : '';
  const recipRaw =
    payload.recipientUserId !== undefined && payload.recipientUserId !== null
      ? String(payload.recipientUserId).trim()
      : '';

  const hasConv = convRaw.length > 0;
  const hasRecip = recipRaw.length > 0;

  if (hasRecip) {
    if (recipRaw === senderId) {
      throw new AppError('INVALID_REQUEST', 400, 'Cannot message yourself');
    }
    const recipient = await findUserById(recipRaw);
    if (!recipient) {
      throw new AppError('NOT_FOUND', 404, 'Recipient not found');
    }
    const conv = await findOrCreateDirectConversation(senderId, recipRaw);
    return insertDirectMessageAndPublish(
      recipRaw,
      {
        conversationId: conv.id,
        senderId,
        body: text,
        mediaKey,
      },
      options,
    );
  }

  if (hasConv) {
    const lookedUp = await lookupConversationById(convRaw);
    if (!lookedUp) {
      throw new AppError('NOT_FOUND', 404, 'Conversation not found');
    }
    if (lookedUp.kind === 'group') {
      throw new AppError(
        'FORBIDDEN',
        403,
        'Group messaging is not supported yet',
      );
    }
    const conv: DirectConversationDocument = lookedUp.doc;
    if (!conv.participantIds.includes(senderId)) {
      throw new AppError(
        'FORBIDDEN',
        403,
        'Not a participant in this conversation',
      );
    }
    const recipientUserId = conv.participantIds.find((id) => id !== senderId);
    if (recipientUserId === undefined) {
      throw new AppError(
        'INTERNAL_ERROR',
        500,
        'Invalid direct conversation participants',
      );
    }
    return insertDirectMessageAndPublish(
      recipientUserId,
      {
        conversationId: conv.id,
        senderId,
        body: text,
        mediaKey,
      },
      options,
    );
  }

  throw new AppError('INVALID_REQUEST', 400, 'Invalid send request');
}
