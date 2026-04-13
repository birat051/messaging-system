import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { components } from '../../../generated/api-types';
import { isE2eeEnvelopeBody } from '@/common/crypto/messageEcies';
import { logout } from '../../auth/stores/authSlice';

export type Message = components['schemas']['Message'];
export type MessageReceiptSummary = components['schemas']['MessageReceiptSummary'];
export type MessageReceiptEntry = components['schemas']['MessageReceiptEntry'];

/** Outbound tick level for messages **you** sent (**Feature 12**). Maps to **`ReceiptTicks`** in the UI. */
export type OutboundReceiptLevel = 'loading' | 'sent' | 'delivered' | 'seen';

type UserPublicKeyResponse = components['schemas']['UserPublicKeyResponse'];

export type MessagingState = {
  activeConversationId: string | null;
  /**
   * **Peer** directory keys from **`GET /users/{id}/public-key`** (Feature 11 / 1:1 E2EE).
   * Used before encrypt to avoid redundant fetches after prefetch or a prior send.
   */
  recipientDirectoryKeyByUserId: Record<string, UserPublicKeyResponse>;
  /** Normalized message entities (deduped by **`message.id`**). */
  messagesById: Record<string, Message>;
  /** **`conversationId` → ordered message ids (oldest → newest, display order). */
  messageIdsByConversationId: Record<string, string[]>;
  /**
   * FIFO of **`client:…`** optimistic ids still waiting for a server **`Message.id`**
   * (reconciled via **`message:send`** ack and/or **`message:new`** for the sender).
   */
  pendingOutgoingClientIdsByConversationId: Record<string, string[]>;
  /**
   * **`messageId` → lifecycle for **your** sends (**loading** / **sent** from client + REST hydrate).
   * **Delivered** / **seen** come from **`receiptsByMessageId`**.
   */
  outboundReceiptByMessageId: Record<string, OutboundReceiptLevel>;
  /** Per-message receipt summaries (**REST** + Socket.IO fan-out merge). */
  receiptsByMessageId: Record<string, MessageReceiptSummary>;
  sendPendingByConversationId: Record<string, boolean>;
  sendErrorByConversationId: Record<string, string | null>;
  /**
   * **Own** messages: plaintext typed at send time, keyed by **`message.id`** — survives REST revalidation
   * when the server only stores the E2EE envelope.
   */
  senderPlaintextByMessageId: Record<string, string>;
  /** **Peer** messages: UTF-8 plaintext after **`decryptE2eeBodyToUtf8`**, keyed by **`message.id`**. */
  decryptedBodyByMessageId: Record<string, string>;
};

const initialState: MessagingState = {
  activeConversationId: null,
  recipientDirectoryKeyByUserId: {},
  messagesById: {},
  messageIdsByConversationId: {},
  pendingOutgoingClientIdsByConversationId: {},
  outboundReceiptByMessageId: {},
  receiptsByMessageId: {},
  sendPendingByConversationId: {},
  sendErrorByConversationId: {},
  senderPlaintextByMessageId: {},
  decryptedBodyByMessageId: {},
};

function mergeReceiptSummary(
  existing: MessageReceiptSummary,
  incoming: MessageReceiptSummary,
): MessageReceiptSummary {
  const a = existing.receiptsByUserId ?? {};
  const b = incoming.receiptsByUserId ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const merged: Record<string, MessageReceiptEntry> = {};
  for (const k of keys) {
    merged[k] = { ...a[k], ...b[k] };
  }
  return {
    ...existing,
    ...incoming,
    messageId: incoming.messageId,
    conversationId: incoming.conversationId,
    createdAt: incoming.createdAt ?? existing.createdAt,
    receiptsByUserId: merged,
  };
}

/** Drop duplicate ids (first occurrence wins) — avoids duplicate rows after optimistic + **`message:new`** races. */
function dedupeIdsStable(ids: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** When the server ack carries ciphertext but the optimistic row had plaintext, keep plaintext in Redux. */
function mergeOwnE2eeBodyFromOptimistic(
  serverMsg: Message,
  optimisticBody: string | null | undefined,
): Message {
  const wire = serverMsg.body ?? '';
  if (!wire || optimisticBody == null) {
    return serverMsg;
  }
  const ob = optimisticBody;
  if (!ob.trim() || isE2eeEnvelopeBody(ob)) {
    return serverMsg;
  }
  if (!isE2eeEnvelopeBody(wire)) {
    return serverMsg;
  }
  return { ...serverMsg, body: ob };
}

/**
 * After **`client:…` → server `id`**, store typing-time plaintext for **`resolveMessageDisplayBody`**
 * and **`hydrateMessagesFromFetch`** (server row stays E2EE wire). Prefer **optimistic** non-envelope
 * **`body`** when **`mergeOwnE2eeBodyFromOptimistic`** did not replace **`merged.body`** (e.g. empty
 * optimistic body with media-only send, or merge early-return).
 */
function setSenderPlaintextAfterOptimisticMerge(
  state: MessagingState,
  serverMessageId: string,
  merged: Message,
  optimisticPrev: Message | undefined,
): void {
  const opt = optimisticPrev?.body;
  const fromOptimistic =
    opt != null &&
    opt !== '' &&
    !isE2eeEnvelopeBody(opt)
      ? opt
      : '';
  const fromMerged =
    merged.body && !isE2eeEnvelopeBody(merged.body) ? merged.body : '';
  const plain = fromOptimistic || fromMerged;
  if (plain) {
    state.senderPlaintextByMessageId[serverMessageId] = plain;
  }
}

/** Default **`messaging`** slice state — tests / **`renderWithProviders`**. */
export const messagingInitialState = initialState;

const messagingSlice = createSlice({
  name: 'messaging',
  initialState,
  reducers: {
    setActiveConversationId(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload;
    },
    setRecipientDirectoryKey(
      state,
      action: PayloadAction<{ userId: string; key: UserPublicKeyResponse }>,
    ) {
      const id = action.payload.userId.trim();
      if (!id) {
        return;
      }
      state.recipientDirectoryKeyByUserId[id] = action.payload.key;
    },
    /**
     * Replaces the in-memory thread for **`conversationId`** from **`GET /conversations/{id}/messages`**
     * (**newest-first** API → stored **oldest-first**).
     */
    hydrateMessagesFromFetch(
      state,
      action: PayloadAction<{
        conversationId: string;
        messages: Message[];
        /** When set, own messages from REST are at least **sent** (server-persisted). */
        currentUserId?: string | null;
      }>,
    ) {
      const { conversationId, messages, currentUserId } = action.payload;
      const selfId = currentUserId?.trim() ?? '';
      const prevIds = state.messageIdsByConversationId[conversationId] ?? [];
      const ordered = [...messages].reverse();
      const newIds = new Set(ordered.map((m) => m.id));
      for (const id of prevIds) {
        if (!newIds.has(id)) {
          delete state.messagesById[id];
          delete state.outboundReceiptByMessageId[id];
          delete state.receiptsByMessageId[id];
          delete state.senderPlaintextByMessageId[id];
          delete state.decryptedBodyByMessageId[id];
        }
      }
      state.messageIdsByConversationId[conversationId] = ordered.map((m) => m.id);
      for (const m of ordered) {
        let body = m.body;
        if (
          selfId &&
          m.senderId === selfId &&
          body &&
          isE2eeEnvelopeBody(body)
        ) {
          const plain = state.senderPlaintextByMessageId[m.id];
          if (plain) {
            body = plain;
          }
        }
        state.messagesById[m.id] = { ...m, body: body ?? null };
        if (selfId && m.senderId === selfId) {
          state.outboundReceiptByMessageId[m.id] = 'sent';
        }
      }
      delete state.pendingOutgoingClientIdsByConversationId[conversationId];
    },
    appendMessageFromSend(
      state,
      action: PayloadAction<{ conversationId: string; message: Message }>,
    ) {
      const { conversationId, message } = action.payload;
      state.messagesById[message.id] = message;
      const ids = state.messageIdsByConversationId[conversationId] ?? [];
      if (!ids.includes(message.id)) {
        state.messageIdsByConversationId[conversationId] = [...ids, message.id];
      }
      if (message.id.startsWith('client:')) {
        const q = state.pendingOutgoingClientIdsByConversationId[conversationId] ?? [];
        state.pendingOutgoingClientIdsByConversationId[conversationId] = [...q, message.id];
        state.outboundReceiptByMessageId[message.id] = 'loading';
      }
    },
    /**
     * Appends a **`message:new`** from Socket.IO when **`message.id`** is not already in **`messagesById`**
     * (dedupe before UI).
     */
    appendIncomingMessageIfNew(
      state,
      action: PayloadAction<{ message: Message; currentUserId?: string | null }>,
    ) {
      const { message, currentUserId } = action.payload;
      if (state.messagesById[message.id]) {
        return;
      }
      const conversationId = message.conversationId;
      const ids = state.messageIdsByConversationId[conversationId] ?? [];
      const selfId = currentUserId?.trim() ?? '';

      if (selfId && message.senderId === selfId) {
        const q = [...(state.pendingOutgoingClientIdsByConversationId[conversationId] ?? [])];
        while (q.length > 0) {
          const head = q[0];
          if (ids.includes(head)) {
            break;
          }
          if (state.messagesById[head]) {
            break;
          }
          q.shift();
        }
        state.pendingOutgoingClientIdsByConversationId[conversationId] = q;

        if (q.length > 0) {
          const optimisticId = q[0];
          const optimistic = state.messagesById[optimisticId];
          if (optimistic) {
            const merged = mergeOwnE2eeBodyFromOptimistic(
              message,
              optimistic.body ?? undefined,
            );
            delete state.messagesById[optimisticId];
            state.messagesById[message.id] = merged;
            delete state.outboundReceiptByMessageId[optimisticId];
            delete state.receiptsByMessageId[optimisticId];
            state.outboundReceiptByMessageId[message.id] = 'sent';
            setSenderPlaintextAfterOptimisticMerge(
              state,
              message.id,
              merged,
              optimistic,
            );
            const idx = ids.indexOf(optimisticId);
            if (idx !== -1) {
              const next = [...ids];
              next[idx] = message.id;
              state.messageIdsByConversationId[conversationId] = dedupeIdsStable(next);
            } else {
              const withoutOpt = ids.filter((id) => id !== optimisticId);
              const next = ids.includes(message.id)
                ? withoutOpt
                : [...withoutOpt, message.id];
              state.messageIdsByConversationId[conversationId] = dedupeIdsStable(next);
            }
            state.pendingOutgoingClientIdsByConversationId[conversationId] = q.slice(1);
            return;
          }
        }
      }

      state.messagesById[message.id] = message;
      if (!ids.includes(message.id)) {
        state.messageIdsByConversationId[conversationId] = [...ids, message.id];
      }
      if (selfId && message.senderId === selfId) {
        if (state.outboundReceiptByMessageId[message.id] === undefined) {
          state.outboundReceiptByMessageId[message.id] = 'sent';
        }
      }
    },
    /**
     * Replaces a **client** optimistic id (**`client:…`**) with the **`Message`** returned from **`message:send`** ack.
     */
    replaceOptimisticMessage(
      state,
      action: PayloadAction<{
        conversationId: string;
        optimisticId: string;
        message: Message;
      }>,
    ) {
      const { conversationId, optimisticId, message } = action.payload;
      const pq = state.pendingOutgoingClientIdsByConversationId[conversationId] ?? [];
      state.pendingOutgoingClientIdsByConversationId[conversationId] = pq.filter(
        (id) => id !== optimisticId,
      );
      const ids = state.messageIdsByConversationId[conversationId] ?? [];
      const idx = ids.indexOf(optimisticId);
      const prev = state.messagesById[optimisticId];
      let merged = message;
      if (prev) {
        merged = mergeOwnE2eeBodyFromOptimistic(message, prev.body ?? undefined);
      }
      delete state.messagesById[optimisticId];
      state.messagesById[message.id] = merged;
      delete state.outboundReceiptByMessageId[optimisticId];
      delete state.receiptsByMessageId[optimisticId];
      state.outboundReceiptByMessageId[message.id] = 'sent';
      setSenderPlaintextAfterOptimisticMerge(state, message.id, merged, prev);
      if (idx === -1) {
        if (!ids.includes(message.id)) {
          state.messageIdsByConversationId[conversationId] = [...ids, message.id];
        }
      } else {
        const next = [...ids];
        next[idx] = message.id;
        state.messageIdsByConversationId[conversationId] = dedupeIdsStable(next);
      }
    },
    setPeerDecryptedBody(
      state,
      action: PayloadAction<{ messageId: string; plaintext: string }>,
    ) {
      state.decryptedBodyByMessageId[action.payload.messageId] =
        action.payload.plaintext;
    },
    removeOptimisticMessage(
      state,
      action: PayloadAction<{ conversationId: string; clientId: string }>,
    ) {
      const { conversationId, clientId } = action.payload;
      const pq = state.pendingOutgoingClientIdsByConversationId[conversationId] ?? [];
      state.pendingOutgoingClientIdsByConversationId[conversationId] = pq.filter(
        (id) => id !== clientId,
      );
      state.messageIdsByConversationId[conversationId] = (
        state.messageIdsByConversationId[conversationId] ?? []
      ).filter((id) => id !== clientId);
      delete state.messagesById[clientId];
      delete state.outboundReceiptByMessageId[clientId];
      delete state.receiptsByMessageId[clientId];
    },
    /**
     * Merges Socket.IO receipt fan-out (**`message:delivered`** / **`message:read`** / **`conversation:read`**)
     * into **`receiptsByMessageId`** (****`docs/PROJECT_PLAN.md` §14****).
     */
    mergeReceiptFanoutFromSocket(
      state,
      action: PayloadAction<{
        messageId: string;
        conversationId: string;
        actorUserId: string;
        at: string;
        kind: 'delivered' | 'seen';
      }>,
    ) {
      const { messageId, conversationId, actorUserId, at, kind } = action.payload;
      const msg = state.messagesById[messageId];
      if (!msg || msg.conversationId !== conversationId) return;

      const prev = state.receiptsByMessageId[messageId];
      const base: MessageReceiptSummary =
        prev ??
        ({
          messageId,
          conversationId: msg.conversationId,
          createdAt: msg.createdAt,
          receiptsByUserId: {},
        } satisfies MessageReceiptSummary);

      const receipts = { ...(base.receiptsByUserId ?? {}) };
      const prevEntry = receipts[actorUserId] ?? {};
      if (kind === 'delivered') {
        receipts[actorUserId] = { ...prevEntry, deliveredAt: at };
      } else {
        receipts[actorUserId] = { ...prevEntry, seenAt: at };
      }
      state.receiptsByMessageId[messageId] = { ...base, receiptsByUserId: receipts };
    },
    mergeReceiptSummariesFromFetch(
      state,
      action: PayloadAction<{ conversationId: string; items: MessageReceiptSummary[] }>,
    ) {
      const { conversationId, items } = action.payload;
      const cid = conversationId.trim();
      if (!cid) return;
      for (const item of items) {
        if (item.conversationId !== cid) continue;
        const prev = state.receiptsByMessageId[item.messageId];
        state.receiptsByMessageId[item.messageId] = prev
          ? mergeReceiptSummary(prev, item)
          : item;
      }
    },
    setSendPending(
      state,
      action: PayloadAction<{ conversationId: string; pending: boolean }>,
    ) {
      const { conversationId, pending } = action.payload;
      if (pending) {
        state.sendPendingByConversationId[conversationId] = true;
      } else {
        delete state.sendPendingByConversationId[conversationId];
      }
    },
    setSendError(
      state,
      action: PayloadAction<{ conversationId: string; error: string | null }>,
    ) {
      const { conversationId, error } = action.payload;
      if (error) {
        state.sendErrorByConversationId[conversationId] = error;
      } else {
        delete state.sendErrorByConversationId[conversationId];
      }
    },
    /**
     * Merges **`messageId` → plaintext** loaded from **`senderPlaintextLocalStore`** after sign-in
     * so **`hydrateMessagesFromFetch`** can overlay E2EE wire bodies with local sender copy.
     */
    hydrateSenderPlaintextFromDisk(
      state,
      action: PayloadAction<Record<string, string>>,
    ) {
      for (const [messageId, plaintext] of Object.entries(action.payload)) {
        if (!messageId.trim()) continue;
        state.senderPlaintextByMessageId[messageId] = plaintext;
      }
    },
    resetMessaging() {
      return initialState;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(logout, () => initialState);
  },
});

export const {
  setActiveConversationId,
  setRecipientDirectoryKey,
  hydrateMessagesFromFetch,
  hydrateSenderPlaintextFromDisk,
  appendMessageFromSend,
  appendIncomingMessageIfNew,
  replaceOptimisticMessage,
  setPeerDecryptedBody,
  removeOptimisticMessage,
  mergeReceiptFanoutFromSocket,
  mergeReceiptSummariesFromFetch,
  setSendPending,
  setSendError,
  resetMessaging,
} = messagingSlice.actions;

export const { reducer: messagingReducer } = messagingSlice;
