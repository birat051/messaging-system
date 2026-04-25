import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '@/store/store';
import type {
  GroupReceiptProgress,
  ReceiptTickState,
} from '@/modules/home/components/receiptTickTypes';
import type {
  ConversationScrollTargetReason,
  MessageReceiptEntry,
  MessagingState,
} from './messagingSlice';

/** How to resolve **delivered** / **seen** for outbound ticks (1:1 peer vs group aggregate). */
export type ReceiptTickContext =
  | { kind: 'direct'; peerUserId: string | null }
  | { kind: 'group'; recipientUserIds: string[] };

export type OutboundReceiptDisplay = {
  state: ReceiptTickState;
  /** Present for **group** threads with more than one recipient (aggregate / per-member policy). */
  groupProgress: GroupReceiptProgress | null;
  /** Short progress line (e.g. `3/5 delivered`) when aggregate is partial. */
  groupSubtitle: string | null;
};

function countGroupReceipts(
  receiptsByUserId: Record<string, MessageReceiptEntry> | undefined,
  recipientUserIds: string[],
): GroupReceiptProgress {
  const total = recipientUserIds.length;
  let delivered = 0;
  let seen = 0;
  for (const uid of recipientUserIds) {
    const e = receiptsByUserId?.[uid];
    if (e?.deliveredAt) delivered += 1;
    if (e?.seenAt) seen += 1;
  }
  return { delivered, seen, total };
}

function groupReceiptSubtitle(
  state: ReceiptTickState,
  g: GroupReceiptProgress,
): string | null {
  const { delivered, seen, total } = g;
  if (total <= 1) return null;
  if (state === 'seen') return null;
  if (delivered < total) return `${delivered}/${total} delivered`;
  if (seen < total) return `${seen}/${total} read`;
  return null;
}

/**
 * Resolves outbound tick **state** and optional **group** aggregate metadata.
 * **Group:** **seen** only when **every** recipient has **`seenAt`**; **delivered** when **all** have **`deliveredAt`**
 * but not all **seen**; otherwise **sent** (or **loading** for optimistic ids).
 */
export function selectOutboundReceiptDisplay(
  messaging: MessagingState,
  messageId: string,
  currentUserId: string,
  context: ReceiptTickContext,
): OutboundReceiptDisplay {
  const msg = messaging.messagesById[messageId];
  if (!msg || msg.senderId !== currentUserId) {
    return { state: 'unknown', groupProgress: null, groupSubtitle: null };
  }

  const outbound = messaging.outboundReceiptByMessageId[messageId];

  if (messageId.startsWith('client:')) {
    if (outbound === 'loading') {
      return { state: 'loading', groupProgress: null, groupSubtitle: null };
    }
    return { state: 'loading', groupProgress: null, groupSubtitle: null };
  }

  if (context.kind === 'direct') {
    const peer = context.peerUserId?.trim() ?? '';
    const entry = peer
      ? messaging.receiptsByMessageId[messageId]?.receiptsByUserId?.[peer]
      : undefined;

    if (entry?.seenAt) {
      return { state: 'seen', groupProgress: null, groupSubtitle: null };
    }
    if (entry?.deliveredAt) {
      return { state: 'delivered', groupProgress: null, groupSubtitle: null };
    }

    if (outbound === 'loading') {
      return { state: 'loading', groupProgress: null, groupSubtitle: null };
    }
    if (outbound === 'delivered' || outbound === 'seen') {
      return { state: outbound, groupProgress: null, groupSubtitle: null };
    }
    if (outbound === 'sent' || outbound === undefined) {
      return { state: 'sent', groupProgress: null, groupSubtitle: null };
    }
    return { state: 'unknown', groupProgress: null, groupSubtitle: null };
  }

  const recipientUserIds = [...new Set(context.recipientUserIds.map((id) => id.trim()).filter(Boolean))];
  const receiptMap = messaging.receiptsByMessageId[messageId]?.receiptsByUserId;
  const counts = countGroupReceipts(receiptMap, recipientUserIds);

  if (counts.total === 0) {
    if (outbound === 'loading') {
      return { state: 'loading', groupProgress: null, groupSubtitle: null };
    }
    if (outbound === 'delivered' || outbound === 'seen') {
      return { state: outbound, groupProgress: null, groupSubtitle: null };
    }
    if (outbound === 'sent' || outbound === undefined) {
      return { state: 'sent', groupProgress: null, groupSubtitle: null };
    }
    return { state: 'unknown', groupProgress: null, groupSubtitle: null };
  }

  let state: ReceiptTickState;
  if (counts.seen === counts.total) {
    state = 'seen';
  } else if (counts.delivered === counts.total) {
    state = 'delivered';
  } else if (outbound === 'loading') {
    state = 'loading';
  } else if (outbound === 'sent' || outbound === undefined) {
    state = 'sent';
  } else {
    state = 'unknown';
  }

  const gp: GroupReceiptProgress = counts;
  const groupSubtitle = counts.total > 1 ? groupReceiptSubtitle(state, counts) : null;

  return { state, groupProgress: gp, groupSubtitle };
}

export function selectOutboundReceiptTickState(
  messaging: MessagingState,
  messageId: string,
  currentUserId: string,
  context: ReceiptTickContext,
): ReceiptTickState {
  return selectOutboundReceiptDisplay(messaging, messageId, currentUserId, context).state;
}

export const selectOutboundReceiptTickForMessage = createSelector(
  [
    (state: RootState) => state.messaging,
    (_state: RootState, messageId: string) => messageId,
    (_state: RootState, _mid: string, currentUserId: string) => currentUserId,
    (_state: RootState, _mid: string, _c: string, context: ReceiptTickContext) => context,
  ],
  (messaging, messageId, currentUserId, context): ReceiptTickState =>
    selectOutboundReceiptTickState(messaging, messageId, currentUserId, context),
);

/** §6 thread scroll target — **`Message.id`** to scroll into view. */
export function selectScrollTargetMessageId(state: RootState): string | null {
  return state.messaging.scrollTargetMessageId;
}

/** §6 thread scroll target — conversation that owns **`scrollTargetMessageId`**. */
export function selectScrollTargetConversationId(state: RootState): string | null {
  return state.messaging.scrollTargetConversationId;
}

/** §6 optional provenance (`message_new`, **`send_ack`**, **`open_thread`**). */
export function selectScrollTargetReason(
  state: RootState,
): ConversationScrollTargetReason | null {
  return state.messaging.scrollTargetReason;
}

/** §6 increments on **`setConversationScrollTarget`** and matching **`setActiveConversationId`** (effect dependency). */
export function selectScrollTargetNonce(state: RootState): number {
  return state.messaging.scrollTargetNonce;
}
