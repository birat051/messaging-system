import { AppError } from '../../utils/errors/AppError.js';
import { lookupConversationById } from '../../data/conversations/repo.js';
import type { DirectConversationDocument } from '../../data/conversations/conversations.collection.js';
import { messageDocumentToApi } from './messageApiShape.js';
import {
  encodeMessageListCursor,
  parseMessageListCursor,
} from './messageCursor.js';
import { listMessagesByConversation } from './repo.js';

export type ListMessagesForParticipantResult = {
  items: ReturnType<typeof messageDocumentToApi>[];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * **`GET /conversations/{conversationId}/messages`** — **direct 1:1** only; **group** returns **403**;
 * caller must be a **participant** (**403** otherwise). Cursor is **newest-first** keyset pagination.
 * **`Message`** items **exclude** receipt fields — use **`GET /conversations/{id}/message-receipts`** for delivery/read sync.
 */
export async function listMessagesForParticipant(params: {
  userId: string;
  conversationId: string;
  cursor?: string | undefined;
  limit: number;
}): Promise<ListMessagesForParticipantResult> {
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

  const { items, hasMore } = await listMessagesByConversation({
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

  return {
    items: items.map(messageDocumentToApi),
    nextCursor,
    hasMore,
  };
}
