import { AppError } from '../errors/AppError.js';
import {
  findOrCreateDirectConversation,
  lookupConversationById,
} from '../conversations/repo.js';
import type { DirectConversationDocument } from '../conversations/types.js';
import { findUserById } from '../users/repo.js';
import type { SendMessageRequest } from '../validation/schemas.js';
import { insertMessage } from './repo.js';
import type { MessageDocument } from './types.js';

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

/**
 * Persists a message for **`POST /messages`** — **direct 1:1** only; **group** threads return **403**.
 */
export async function sendMessageForUser(
  senderId: string,
  payload: SendMessageRequest,
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
    return insertMessage({
      conversationId: conv.id,
      senderId,
      body: text,
      mediaKey,
    });
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
    return insertMessage({
      conversationId: conv.id,
      senderId,
      body: text,
      mediaKey,
    });
  }

  throw new AppError('INVALID_REQUEST', 400, 'Invalid send request');
}
