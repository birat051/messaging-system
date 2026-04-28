import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { components } from '../../../generated/api-types';
import { isMessageWireE2ee } from '@/common/crypto/messageHybrid';
import { logout } from '../../auth/stores/authSlice';

export type Message = components['schemas']['Message'];
/**
 * **`messagesById`** values — server **`Message`** plus optional client-only preview URL for optimistic rows.
 */
export type StoredMessage = Message & {
  mediaPreviewUrl?: string | null;
};
export type MessageReceiptSummary = components['schemas']['MessageReceiptSummary'];
export type MessageReceiptEntry = components['schemas']['MessageReceiptEntry'];

/** Outbound tick level for messages **you** sent (**Feature 12**). Maps to **`ReceiptTicks`** in the UI. */
export type OutboundReceiptLevel = 'loading' | 'sent' | 'delivered' | 'seen';

/**
 * Why a **scroll-to-message** target was set — for tests / DevTools only (**`docs/TASK_CHECKLIST.md`** §6).
 */
export type ConversationScrollTargetReason =
  | 'message_new'
  | 'send_ack'
  | 'open_thread';

/**
 * **New DM from search** — no **`conversationId`** until the first **`message:send`** ack.
 * Drives the main thread pane (**`NewDirectThreadComposer`**) while **`activeConversationId`** is null.
 */
export type PendingDirectPeer = {
  userId: string;
  username: string | null;
  displayName: string | null;
  profilePicture: string | null;
  guest: boolean;
};

export type MessagingState = {
  activeConversationId: string | null;
  pendingDirectPeer: PendingDirectPeer | null;
  /** Normalized message entities (deduped by **`message.id`**). */
  messagesById: Record<string, StoredMessage>;
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
  /** **Peer** messages: UTF-8 plaintext after hybrid decrypt, keyed by **`message.id`**. */
  decryptedBodyByMessageId: Record<string, string>;
  /**
   * **Peer** messages: S3 key parsed from hybrid **v1** inner JSON (**`m.k`**) when **`Message.mediaKey`** is null on the wire.
   */
  decryptedAttachmentKeyByMessageId: Record<string, string>;
  /**
   * **Peer** messages: retrievable **http(s)** URL from hybrid **v1** (**`m.u`** or **`m.b`+`m.k`**) for **`ThreadMessageMedia`** when
   * **`VITE_S3_*`** is unavailable on the recipient.
   */
  decryptedAttachmentUrlByMessageId: Record<string, string>;
  /**
   * **Thread scroll target (§6):** after send/receive, UI scrolls this **`Message.id`** row into view for
   * **`scrollTargetConversationId`**, then **`clearConversationScrollTarget`**. **Cross-conversation:** each
   * **`setConversationScrollTarget`** overwrites the previous target (single pending target).
   */
  scrollTargetMessageId: string | null;
  scrollTargetConversationId: string | null;
  /** Optional provenance for debugging / tests. */
  scrollTargetReason: ConversationScrollTargetReason | null;
  /**
   * Increments on every **`setConversationScrollTarget`** and when **`setActiveConversationId`** opens the
   * conversation that matches **`scrollTargetConversationId`** (pending **`messageId`**) so
   * **`ThreadMessageList`** re-runs §6 consumers even if **`activeConversationId`** was already that id
   * (list re-select / **`useSelector`** primitive equality).
   */
  scrollTargetNonce: number;
};

const initialState: MessagingState = {
  activeConversationId: null,
  pendingDirectPeer: null,
  messagesById: {},
  messageIdsByConversationId: {},
  pendingOutgoingClientIdsByConversationId: {},
  outboundReceiptByMessageId: {},
  receiptsByMessageId: {},
  sendPendingByConversationId: {},
  sendErrorByConversationId: {},
  senderPlaintextByMessageId: {},
  decryptedBodyByMessageId: {},
  decryptedAttachmentKeyByMessageId: {},
  decryptedAttachmentUrlByMessageId: {},
  scrollTargetMessageId: null,
  scrollTargetConversationId: null,
  scrollTargetReason: null,
  scrollTargetNonce: 0,
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
function mergeOwnHybridWireBodyFromOptimistic(
  serverMsg: Message,
  optimisticBody: string | null | undefined,
): Message {
  const wire = serverMsg.body ?? '';
  if (!wire || optimisticBody == null) {
    return serverMsg;
  }
  const ob = optimisticBody;
  if (!ob.trim()) {
    return serverMsg;
  }
  if (!isMessageWireE2ee(serverMsg)) {
    return serverMsg;
  }
  return { ...serverMsg, body: ob };
}

/**
 * **`Message`** from the server never includes **`mediaPreviewUrl`** (client-only). Preserve it from the
 * optimistic **`StoredMessage`** so image **`src`** survives **`message:send`** ack / **`message:new`** when
 * **`getMediaPublicObjectUrl(mediaKey)`** is unavailable (missing **`VITE_S3_*`**) — otherwise both sides
 * effectively lose the thumbnail until reload.
 */
function mergeServerMessageWithOptimisticClientFields(
  serverMsg: Message,
  optimistic: Message | undefined,
): StoredMessage {
  const bodyMerged = optimistic
    ? mergeOwnHybridWireBodyFromOptimistic(serverMsg, optimistic.body ?? undefined)
    : serverMsg;
  const preview = (optimistic as StoredMessage | undefined)?.mediaPreviewUrl?.trim();
  const serverMk = serverMsg.mediaKey?.trim() ?? '';
  const optMk = optimistic?.mediaKey?.trim() ?? '';
  const mediaKey =
    serverMk.length > 0
      ? serverMsg.mediaKey
      : optMk.length > 0
        ? optimistic!.mediaKey
        : null;
  const withKey = { ...bodyMerged, mediaKey };
  if (preview) {
    return { ...withKey, mediaPreviewUrl: preview };
  }
  return withKey;
}

/**
 * After **`client:…` → server `id`**, store typing-time plaintext for **`resolveMessageDisplayBody`**
 * and **`hydrateMessagesFromFetch`** (server row stays hybrid wire). Prefer **optimistic** plaintext
 * **`body`** when **`mergeOwnHybridWireBodyFromOptimistic`** did not replace **`merged.body`** (e.g. empty
 * optimistic body with media-only send, or merge early-return).
 */
function setSenderPlaintextAfterOptimisticMerge(
  state: MessagingState,
  serverMessageId: string,
  merged: Message,
  optimisticPrev: Message | undefined,
): void {
  const opt = optimisticPrev?.body;
  const fromOptimistic = opt != null && opt !== '' ? opt : '';
  const fromMerged =
    merged.body && !isMessageWireE2ee(merged) ? merged.body : '';
  const plain = fromOptimistic || fromMerged;
  if (plain) {
    state.senderPlaintextByMessageId[serverMessageId] = plain;
  }
}

function mergeHydrateMediaKey(existing: StoredMessage, fetched: Message): string | null {
  const serverMk = fetched.mediaKey?.trim() ?? '';
  if (serverMk.length > 0) {
    return fetched.mediaKey ?? null;
  }
  const retained = existing.mediaKey?.trim() ?? '';
  return retained.length > 0 ? existing.mediaKey ?? null : fetched.mediaKey ?? null;
}

/**
 * **`GET /conversations/{id}/messages`** may race **`message:new`** and temporarily produce a **`Message`** row
 * missing **`encryptedMessageKeys` / `iv` / `algorithm`** while Redux still holds the full hybrid envelope from
 * Socket.IO — without merging, **`isHybridE2eeMessage`** becomes false on the recipient and
 * **`usePeerMessageDecryption`** never runs (only **`message:new parse`** logs appear).
 *
 * **`mediaKey`:** persisted hybrid attachment sends use **`mediaKey: null`** on the wire — the sender’s client keeps
 * the real key via **`mergeServerMessageWithOptimisticClientFields`**. **`GET`** returns the same null; without
 * carrying forward **`existing.mediaKey`**, **`ThreadMessageList`** has no **`mediaKey`** for **`ThreadMessageMedia`**
 * until **`decryptedAttachmentKeyByMessageId`** fills (recipient or own multi-device echo) — briefly or permanently
 * empty **`<img>`** host when maps lag.
 */
export function mergeHydrateFetchedWithExisting(
  existing: StoredMessage | undefined,
  fetched: Message,
): StoredMessage {
  if (!existing) {
    return fetched;
  }
  const pv = existing.mediaPreviewUrl?.trim();
  const pvOut = pv && pv.length > 0 ? { mediaPreviewUrl: pv } : {};
  const mediaKeyMerged = mergeHydrateMediaKey(existing, fetched);

  if (isMessageWireE2ee(existing) && !isMessageWireE2ee(fetched)) {
    return {
      ...fetched,
      body: fetched.body ?? existing.body,
      iv: existing.iv ?? fetched.iv ?? null,
      algorithm: existing.algorithm ?? fetched.algorithm ?? null,
      encryptedMessageKeys: existing.encryptedMessageKeys,
      ...pvOut,
      mediaKey: mediaKeyMerged,
    };
  }

  const nFetched = fetched.encryptedMessageKeys
    ? Object.keys(fetched.encryptedMessageKeys).length
    : 0;
  const nExisting = existing.encryptedMessageKeys
    ? Object.keys(existing.encryptedMessageKeys).length
    : 0;
  if (isMessageWireE2ee(existing) && nExisting > 0 && nFetched === 0) {
    return {
      ...fetched,
      body: fetched.body ?? existing.body,
      iv: existing.iv ?? fetched.iv ?? null,
      algorithm: existing.algorithm ?? fetched.algorithm ?? null,
      encryptedMessageKeys: existing.encryptedMessageKeys,
      ...pvOut,
      mediaKey: mediaKeyMerged,
    };
  }

  return Object.keys(pvOut).length > 0
    ? { ...fetched, ...pvOut, mediaKey: mediaKeyMerged }
    : { ...fetched, mediaKey: mediaKeyMerged };
}

/** Default **`messaging`** slice state — tests / **`renderWithProviders`**. */
export const messagingInitialState = initialState;

const messagingSlice = createSlice({
  name: 'messaging',
  initialState,
  reducers: {
    setActiveConversationId(state, action: PayloadAction<string | null>) {
      state.activeConversationId = action.payload;
      if (action.payload) {
        state.pendingDirectPeer = null;
      }
      const next = action.payload?.trim() ?? '';
      const targetC = state.scrollTargetConversationId?.trim() ?? '';
      const targetM = state.scrollTargetMessageId?.trim() ?? '';
      if (next && targetC && targetM && next === targetC) {
        state.scrollTargetNonce += 1;
      }
    },
    setPendingDirectPeer(
      state,
      action: PayloadAction<PendingDirectPeer | null>,
    ) {
      state.pendingDirectPeer = action.payload;
      if (action.payload) {
        state.activeConversationId = null;
      }
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
          delete state.decryptedAttachmentKeyByMessageId[id];
          delete state.decryptedAttachmentUrlByMessageId[id];
        }
      }
      state.messageIdsByConversationId[conversationId] = ordered.map((m) => m.id);
      for (const m of ordered) {
        const prevStored = state.messagesById[m.id];
        const merged = mergeHydrateFetchedWithExisting(prevStored, m);
        let body = merged.body;
        if (
          selfId &&
          merged.senderId === selfId &&
          body &&
          isMessageWireE2ee(merged)
        ) {
          const plain = state.senderPlaintextByMessageId[merged.id];
          if (plain) {
            body = plain;
          }
        }
        state.messagesById[merged.id] = { ...merged, body: body ?? null };
        if (selfId && merged.senderId === selfId) {
          state.outboundReceiptByMessageId[merged.id] = 'sent';
        }
      }
      delete state.pendingOutgoingClientIdsByConversationId[conversationId];
    },
    appendMessageFromSend(
      state,
      action: PayloadAction<{ conversationId: string; message: StoredMessage }>,
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
            const merged = mergeServerMessageWithOptimisticClientFields(
              message,
              optimistic,
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
     * **`NewDirectThreadComposer`** (first DM): there is no **`client:…`** optimistic row, so
     * **`replaceOptimisticMessage`** never runs. Record the typed plaintext for the server **`message.id`**
     * so **`resolveMessageDisplayBody`** shows it after **`hydrateMessagesFromFetch`** (E2EE wire body only).
     */
    recordOwnSendPlaintext(
      state,
      action: PayloadAction<{ messageId: string; plaintext: string }>,
    ) {
      const messageId = action.payload.messageId?.trim() ?? '';
      const t = action.payload.plaintext;
      if (!messageId || t === undefined || t === '') {
        return;
      }
      state.senderPlaintextByMessageId[messageId] = t;
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
      const merged = mergeServerMessageWithOptimisticClientFields(message, prev);
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
      action: PayloadAction<{
        messageId: string;
        plaintext: string;
        /** From hybrid plaintext **v1** **`m.k`** when the server did not store **`mediaKey`**. */
        resolvedAttachmentKey?: string | null;
        /** From hybrid **v1** **`m.u`** / **`m.b`+`m.k`** — display URL for attachments. */
        resolvedAttachmentUrl?: string | null;
      }>,
    ) {
      const { messageId, plaintext, resolvedAttachmentKey, resolvedAttachmentUrl } =
        action.payload;
      state.decryptedBodyByMessageId[messageId] = plaintext;
      if (resolvedAttachmentKey !== undefined) {
        const k = resolvedAttachmentKey?.trim() ?? '';
        if (k.length > 0) {
          state.decryptedAttachmentKeyByMessageId[messageId] = k;
        } else {
          delete state.decryptedAttachmentKeyByMessageId[messageId];
        }
      }
      if (resolvedAttachmentUrl !== undefined) {
        const u = resolvedAttachmentUrl?.trim() ?? '';
        if (u.length > 0) {
          state.decryptedAttachmentUrlByMessageId[messageId] = u;
        } else {
          delete state.decryptedAttachmentUrlByMessageId[messageId];
        }
      }
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
    /**
     * **§6 scroll target:** latest **`messageId` + `conversationId`** wins (overwrite). **`nonce`** bumps so
     * consumers can re-run scroll logic when the same id is set again.
     *
     * **`reason: 'message_new'`:** same listener sets this on every successful **`appendIncomingMessageIfNew`**
     * merge **regardless of `activeConversationId`**, so a user who opens the thread later still has a concrete
     * **`messageId`** to scroll to (not only when the chat is already focused).
     * **`reason: 'send_ack'`:** that listener sets this on **`replaceOptimisticMessage`** (**`useSendMessage`** ack);
     * first-DM **`NewDirectThreadComposer`** dispatches **`setConversationScrollTarget`** after **`sendMessage`**.
     */
    setConversationScrollTarget(
      state,
      action: PayloadAction<{
        messageId: string;
        conversationId: string;
        reason?: ConversationScrollTargetReason;
      }>,
    ) {
      const messageId = action.payload.messageId.trim();
      const conversationId = action.payload.conversationId.trim();
      if (!messageId || !conversationId) {
        return;
      }
      state.scrollTargetMessageId = messageId;
      state.scrollTargetConversationId = conversationId;
      state.scrollTargetReason = action.payload.reason ?? null;
      state.scrollTargetNonce += 1;
    },
    /** Clears the pending scroll target (no-op if already clear). */
    clearConversationScrollTarget(state) {
      if (
        state.scrollTargetMessageId == null &&
        state.scrollTargetConversationId == null
      ) {
        return;
      }
      state.scrollTargetMessageId = null;
      state.scrollTargetConversationId = null;
      state.scrollTargetReason = null;
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
  setPendingDirectPeer,
  hydrateMessagesFromFetch,
  hydrateSenderPlaintextFromDisk,
  appendMessageFromSend,
  appendIncomingMessageIfNew,
  recordOwnSendPlaintext,
  replaceOptimisticMessage,
  setPeerDecryptedBody,
  removeOptimisticMessage,
  mergeReceiptFanoutFromSocket,
  mergeReceiptSummariesFromFetch,
  setSendPending,
  setSendError,
  setConversationScrollTarget,
  clearConversationScrollTarget,
  resetMessaging,
} = messagingSlice.actions;

export const { reducer: messagingReducer } = messagingSlice;
