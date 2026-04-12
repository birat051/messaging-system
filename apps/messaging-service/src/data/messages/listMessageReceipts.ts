import { AppError } from '../../utils/errors/AppError.js';
import { lookupConversationById } from '../../data/conversations/repo.js';
import type { DirectConversationDocument } from '../../data/conversations/conversations.collection.js';
import { findConversationReadByUserAndConversation } from '../conversationReads/repo.js';
import { messageReceiptSummaryToApi } from './messageReceiptSummaryApiShape.js';
import {
  encodeMessageListCursor,
  parseMessageListCursor,
} from './messageCursor.js';
import { listMessageReceiptSummariesByConversation } from './repo.js';

export type ListMessageReceiptsForParticipantResult = {
  items: ReturnType<typeof messageReceiptSummaryToApi>[];
  nextCursor: string | null;
  hasMore: boolean;
  readCursor: {
    lastReadMessageId: string;
    lastReadAt: string;
  } | null;
};

/**
 * **`GET /conversations/{conversationId}/message-receipts`** — **direct 1:1** only; **group** **403**;
 * participant-only. Same keyset cursor as message list; **no** message body or media — receipt sync only.
 */
export async function listMessageReceiptsForParticipant(params: {
  userId: string;
  conversationId: string;
  cursor?: string | undefined;
  limit: number;
}): Promise<ListMessageReceiptsForParticipantResult> {
  const cursorBoundary =
    params.cursor !== undefined && params.cursor !== null && params.cursor.trim() !== ''
      ? parseMessageListCursor(params.cursor)
      : undefined;

  const lookedUp = await lookupConversationById(params.conversationId);
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
  if (!conv.participantIds.includes(params.userId)) {
    throw new AppError(
      'FORBIDDEN',
      403,
      'Not a participant in this conversation',
    );
  }

  const { items, hasMore } = await listMessageReceiptSummariesByConversation({
    conversationId: conv.id,
    limit: params.limit,
    cursor: cursorBoundary,
  });

  const nextCursor =
    hasMore && items.length > 0
      ? encodeMessageListCursor({
          createdAt: items[items.length - 1]!.createdAt,
          id: items[items.length - 1]!.id,
        })
      : null;

  const readDoc = await findConversationReadByUserAndConversation({
    userId: params.userId,
    conversationId: conv.id,
  });

  return {
    items: items.map(messageReceiptSummaryToApi),
    nextCursor,
    hasMore,
    readCursor: readDoc
      ? {
          lastReadMessageId: readDoc.lastReadMessageId,
          lastReadAt: readDoc.lastReadAt.toISOString(),
        }
      : null,
  };
}
