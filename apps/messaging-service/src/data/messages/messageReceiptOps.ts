import { AppError } from '../../utils/errors/AppError.js';
import { lookupConversationById } from '../conversations/repo.js';
import type { DirectConversationDocument } from '../conversations/conversations.collection.js';
import {
  publishReceiptToParticipants,
  type ReceiptFanoutPayload,
} from '../messaging/receiptPublish.js';
import { upsertConversationRead } from '../conversationReads/repo.js';
import { findMessageById, setReceiptDelivered, setReceiptSeen } from './repo.js';

async function requireDirectConversation(
  conversationId: string,
): Promise<DirectConversationDocument> {
  const v = await lookupConversationById(conversationId);
  if (!v) {
    throw new AppError('NOT_FOUND', 404, 'Conversation not found');
  }
  if (v.kind === 'group') {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Group messaging is not supported yet',
    );
  }
  return v.doc;
}

function assertRecipientNotSender(actorUserId: string, senderId: string): void {
  if (actorUserId === senderId) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Sender cannot set delivery or read state on own message',
    );
  }
}

function assertParticipant(actorUserId: string, conv: DirectConversationDocument): void {
  if (!conv.participantIds.includes(actorUserId)) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Not a participant in this conversation',
    );
  }
}

function mapReceiptFailure(
  r: { ok: false; reason: 'not_found' | 'conversation_mismatch' },
): never {
  if (r.reason === 'not_found') {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  throw new AppError('INVALID_REQUEST', 400, 'Message does not belong to conversation');
}

function toFanoutPayload(
  actorUserId: string,
  messageId: string,
  conversationId: string,
  at: Date,
): ReceiptFanoutPayload {
  return {
    userId: actorUserId,
    messageId,
    conversationId,
    at: at.toISOString(),
  };
}

export async function processMessageDelivered(params: {
  actorUserId: string;
  messageId: string;
  conversationId: string;
  originSocketId?: string;
}): Promise<void> {
  const at = new Date();
  const conv = await requireDirectConversation(params.conversationId);
  assertParticipant(params.actorUserId, conv);

  const msg = await findMessageById(params.messageId);
  if (!msg) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  if (msg.conversationId !== params.conversationId) {
    throw new AppError('INVALID_REQUEST', 400, 'Message does not belong to conversation');
  }
  assertRecipientNotSender(params.actorUserId, msg.senderId);

  const r = await setReceiptDelivered({
    messageId: params.messageId,
    conversationId: params.conversationId,
    userId: params.actorUserId,
    at,
  });
  if (!r.ok) {
    mapReceiptFailure(r);
  }
  if (!r.changed) {
    return;
  }

  await publishReceiptToParticipants({
    participantIds: conv.participantIds,
    actorUserId: params.actorUserId,
    socketEvent: 'message:delivered',
    data: toFanoutPayload(
      params.actorUserId,
      params.messageId,
      params.conversationId,
      at,
    ),
    originSocketId: params.originSocketId,
  });
}

export async function processMessageRead(params: {
  actorUserId: string;
  messageId: string;
  conversationId: string;
  originSocketId?: string;
}): Promise<void> {
  const at = new Date();
  const conv = await requireDirectConversation(params.conversationId);
  assertParticipant(params.actorUserId, conv);

  const msg = await findMessageById(params.messageId);
  if (!msg) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  if (msg.conversationId !== params.conversationId) {
    throw new AppError('INVALID_REQUEST', 400, 'Message does not belong to conversation');
  }
  assertRecipientNotSender(params.actorUserId, msg.senderId);

  const seen = await setReceiptSeen({
    messageId: params.messageId,
    conversationId: params.conversationId,
    userId: params.actorUserId,
    at,
  });
  if (!seen.ok) {
    mapReceiptFailure(seen);
  }

  const cursor = await upsertConversationRead({
    userId: params.actorUserId,
    conversationId: params.conversationId,
    lastReadMessageId: params.messageId,
    lastReadAt: at,
  });

  if (!seen.changed && !cursor.changed) {
    return;
  }

  await publishReceiptToParticipants({
    participantIds: conv.participantIds,
    actorUserId: params.actorUserId,
    socketEvent: 'message:read',
    data: toFanoutPayload(
      params.actorUserId,
      params.messageId,
      params.conversationId,
      at,
    ),
    originSocketId: params.originSocketId,
  });
}

/**
 * Read cursor only (no **`seenAt`** on the message row) — e.g. “mark read” without per-message ticks.
 */
export async function processConversationRead(params: {
  actorUserId: string;
  messageId: string;
  conversationId: string;
  originSocketId?: string;
}): Promise<void> {
  const at = new Date();
  const conv = await requireDirectConversation(params.conversationId);
  assertParticipant(params.actorUserId, conv);

  const msg = await findMessageById(params.messageId);
  if (!msg) {
    throw new AppError('NOT_FOUND', 404, 'Message not found');
  }
  if (msg.conversationId !== params.conversationId) {
    throw new AppError('INVALID_REQUEST', 400, 'Message does not belong to conversation');
  }
  assertRecipientNotSender(params.actorUserId, msg.senderId);

  const cursor = await upsertConversationRead({
    userId: params.actorUserId,
    conversationId: params.conversationId,
    lastReadMessageId: params.messageId,
    lastReadAt: at,
  });

  if (!cursor.changed) {
    return;
  }

  await publishReceiptToParticipants({
    participantIds: conv.participantIds,
    actorUserId: params.actorUserId,
    socketEvent: 'conversation:read',
    data: toFanoutPayload(
      params.actorUserId,
      params.messageId,
      params.conversationId,
      at,
    ),
    originSocketId: params.originSocketId,
  });
}
