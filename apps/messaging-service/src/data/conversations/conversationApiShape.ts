import type { DirectConversationDocument } from './conversations.collection.js';

/**
 * Maps a persisted **direct** row to the public **`Conversation`** REST shape.
 * **`peerUserId`** is the participant that is not **`currentUserId`**.
 */
export function directConversationDocumentToApi(
  doc: DirectConversationDocument,
  currentUserId: string,
): {
  id: string;
  title: string | null;
  isGroup: boolean;
  peerUserId: string | null;
  updatedAt: string;
} {
  const peerUserId =
    doc.participantIds.find((id) => id !== currentUserId) ?? null;
  return {
    id: doc.id,
    title: null,
    isGroup: false,
    peerUserId,
    updatedAt: doc.updatedAt.toISOString(),
  };
}
