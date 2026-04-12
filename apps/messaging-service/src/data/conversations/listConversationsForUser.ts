import { directConversationDocumentToApi } from './conversationApiShape.js';
import {
  encodeConversationListCursor,
  parseConversationListCursor,
} from './conversationCursor.js';
import { listDirectConversationsForParticipant } from './repo.js';

export type ListConversationsForUserResult = {
  items: ReturnType<typeof directConversationDocumentToApi>[];
  nextCursor: string | null;
  hasMore: boolean;
};

/**
 * **`GET /conversations`** — **direct 1:1** threads where the user is a **participant**; **newest first** keyset pagination.
 */
export async function listConversationsForUser(params: {
  userId: string;
  cursor?: string | undefined;
  limit: number;
}): Promise<ListConversationsForUserResult> {
  const cursorBoundary =
    params.cursor !== undefined && params.cursor !== null && params.cursor.trim() !== ''
      ? parseConversationListCursor(params.cursor)
      : undefined;

  const { items, hasMore } = await listDirectConversationsForParticipant({
    userId: params.userId,
    limit: params.limit,
    cursor: cursorBoundary,
  });

  const nextCursor =
    hasMore && items.length > 0
      ? encodeConversationListCursor({
          updatedAt: items[items.length - 1]!.updatedAt,
          id: items[items.length - 1]!.id,
        })
      : null;

  return {
    items: items.map((doc) =>
      directConversationDocumentToApi(doc, params.userId),
    ),
    nextCursor,
    hasMore,
  };
}
