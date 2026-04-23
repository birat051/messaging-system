import type { components } from '@/generated/api-types';

type Message = components['schemas']['Message'];

/** **`useSendMessage`** optimistic ids — no Mongo row; must not be sent on receipt Socket.IO events. */
export function isOptimisticClientMessageId(messageId: string): boolean {
  return messageId.trim().startsWith('client:');
}
type MessageReceiptSummary = components['schemas']['MessageReceiptSummary'];

/**
 * **True** when **`GET …/message-receipts`** (merged into **`receiptsByMessageId`**) already records the
 * current user as **seen** on this message — skip redundant **`message:read`** / **`conversation:read`** emits.
 */
export function currentUserHasSeenMessage(
  receiptsByMessageId: Record<string, MessageReceiptSummary>,
  messageId: string,
  currentUserId: string | null | undefined,
): boolean {
  const uid = currentUserId?.trim();
  if (!uid) {
    return false;
  }
  const seenAt = receiptsByMessageId[messageId]?.receiptsByUserId?.[uid]?.seenAt;
  return typeof seenAt === 'string' && seenAt.trim() !== '';
}

export type PeerReadHydrationFromReceipts = {
  /** Peer **`messageId`**s the server already records as **seen** for the current user — seed **`messageReadEmittedRef`**. */
  peerMessageIdsSeen: string[];
  /**
   * **`${conversationId}:${lastMessageId}`** when the **last** message in the thread is a **peer** message
   * already **seen** — seed **`conversationReadCursorKeyRef`** so **`conversation:read`** does not re-fire after reload / **`mergeReceiptSummariesFromFetch`**.
   */
  conversationReadCursorKey: string | null;
};

/**
 * Derives in-session dedupe state from **`receiptsByMessageId`** (REST hydrate via **`mergeReceiptSummariesFromFetch`**)
 * so a full reload or SWR receipt revalidate does not re-flood **`message:read`** / **`conversation:read`**.
 */
export function hydratePeerReadDedupeFromReceipts(params: {
  activeConversationId: string | null;
  messageIds: readonly string[];
  messagesById: Record<string, Message>;
  receiptsByMessageId: Record<string, MessageReceiptSummary>;
  currentUserId: string | null | undefined;
}): PeerReadHydrationFromReceipts {
  const cid = params.activeConversationId?.trim() ?? '';
  const uid = params.currentUserId?.trim();
  if (!cid || !uid) {
    return { peerMessageIdsSeen: [], conversationReadCursorKey: null };
  }

  const peerMessageIdsSeen: string[] = [];
  for (const mid of params.messageIds) {
    const msg = params.messagesById[mid];
    if (
      msg &&
      msg.senderId !== uid &&
      currentUserHasSeenMessage(params.receiptsByMessageId, mid, uid)
    ) {
      peerMessageIdsSeen.push(mid);
    }
  }

  if (params.messageIds.length === 0) {
    return { peerMessageIdsSeen, conversationReadCursorKey: null };
  }

  const lastId = params.messageIds[params.messageIds.length - 1];
  if (!lastId) {
    return { peerMessageIdsSeen, conversationReadCursorKey: null };
  }

  const lastMsg = params.messagesById[lastId];
  if (
    !lastMsg ||
    lastMsg.senderId === uid ||
    !currentUserHasSeenMessage(params.receiptsByMessageId, lastId, uid)
  ) {
    return { peerMessageIdsSeen, conversationReadCursorKey: null };
  }

  return {
    peerMessageIdsSeen,
    conversationReadCursorKey: `${cid}:${lastId}`,
  };
}
