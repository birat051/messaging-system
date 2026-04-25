import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from 'react';
import { queryThreadMessageRowInLog } from './queryThreadMessageRowInLog';
import { describeOutboundReceiptStatus } from './receiptTickHelpers';
import { ReceiptTicks } from './ReceiptTicks';
import {
  selectScrollTargetConversationId,
  selectScrollTargetMessageId,
  selectScrollTargetNonce,
} from '@/modules/home/stores/messagingSelectors';
import {
  clearConversationScrollTarget,
} from '@/modules/home/stores/messagingSlice';
import type { RootState } from '@/store/store';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useStore } from 'react-redux';
import { MessageBubble } from './MessageBubble';
import { ThreadMessageMedia } from './ThreadMessageMedia';
import type {
  ThreadMessageItem,
  ThreadMessageListProps,
} from './threadMessageListTypes';

/** Pixels from the bottom of the log considered “still at bottom” for auto-scroll. */
const SCROLL_BOTTOM_THRESHOLD_PX = 80;

const EMPTY_MESSAGE_IDS: string[] = [];

/** §6.3 — hydrate / DOM race: poll until row scrolls or cap (then **`clearConversationScrollTarget`**). */
const SCROLL_TARGET_RETRY_MS = 50;
const SCROLL_TARGET_MAX_WAIT_MS = 4000;
const SCROLL_TARGET_MAX_RETRIES = Math.ceil(
  SCROLL_TARGET_MAX_WAIT_MS / SCROLL_TARGET_RETRY_MS,
);

/** Used with **`pinnedToBottomRef`** for legacy tail-follow (§6.4) — not the Redux **`scrollTarget*`** path. */
function isNearBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

/** Pin-to-bottom helper (§6.4) — **`scrollTop`** to newest row; complements §6 **`scrollIntoView`** on a specific id. */
function scrollLogToBottom(el: HTMLElement): void {
  el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
}

function ThreadMessageRow({
  m,
  onPeerMessageVisible,
  registerRowEl,
}: {
  m: ThreadMessageItem;
  onPeerMessageVisible?: (messageId: string) => void;
  /** §6: map **`Message.id`** → row **`article`** for programmatic scroll. */
  registerRowEl?: (messageId: string, el: HTMLElement | null) => void;
}) {
  const articleRef = useRef<HTMLElement | null>(null);

  const assignArticleRef = useCallback(
    (node: HTMLElement | null) => {
      articleRef.current = node;
      registerRowEl?.(m.id, node);
    },
    [m.id, registerRowEl],
  );

  useEffect(() => {
    if (m.isOwn || !onPeerMessageVisible) return;
    const el = articleRef.current;
    if (!el) return;
    let emitted = false;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !emitted) {
          emitted = true;
          onPeerMessageVisible(m.id);
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [m.id, m.isOwn, onPeerMessageVisible]);

  return (
    <article
      ref={assignArticleRef}
      data-message-id={m.id}
      aria-label={m.isOwn ? 'Message from you' : 'Message from peer'}
      className={
        m.isOwn
          ? 'flex min-w-0 max-w-[min(85%,20rem)] w-full flex-col items-end gap-1 self-end'
          : 'flex min-w-0 max-w-[min(85%,20rem)] w-full flex-col items-start gap-1 self-start'
      }
    >
      <MessageBubble isOwn={m.isOwn}>
        {bubbleParagraph(m)}
        {m.mediaKey?.trim() ? (
          <ThreadMessageMedia
            mediaKey={m.mediaKey.trim()}
            messageId={m.id}
            isOwn={m.isOwn}
            previewUrlOverride={m.mediaPreviewUrl ?? null}
          />
        ) : null}
      </MessageBubble>
      {m.isOwn ? (
        m.outboundReceipt ? (
          <div
            role="status"
            aria-live="polite"
            aria-busy={m.outboundReceipt === 'loading'}
            aria-label={`${formatMessageStatusTime(m.createdAt)}. ${describeOutboundReceiptStatus(
              m.outboundReceipt,
              m.groupReceiptSubtitle,
              m.groupReceiptProgress ?? null,
            )}`}
            className="flex items-center justify-end gap-1.5 px-1"
          >
            <time
              dateTime={m.createdAt}
              aria-hidden="true"
              className="text-muted text-xs tabular-nums"
            >
              {formatMessageTimestamp(m.createdAt)}
            </time>
            <ReceiptTicks
              state={m.outboundReceipt}
              groupProgress={m.groupReceiptProgress ?? undefined}
              groupSubtitle={m.groupReceiptSubtitle ?? undefined}
              decorative
            />
          </div>
        ) : (
          <div className="flex items-center justify-end gap-1.5 px-1">
            <time
              dateTime={m.createdAt}
              className="text-muted text-xs tabular-nums"
            >
              {formatMessageTimestamp(m.createdAt)}
            </time>
          </div>
        )
      ) : (
        <time
          dateTime={m.createdAt}
          className="text-muted px-1 text-xs tabular-nums"
        >
          {formatMessageTimestamp(m.createdAt)}
        </time>
      )}
    </article>
  );
}

/** Longer locale string for **`aria-label`** on outbound status (time + delivery text). */
function formatMessageStatusTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  return d.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function bubbleParagraph(m: ThreadMessageItem): ReactNode {
  const t = m.body?.trim() ?? '';
  if (t.length === 0) {
    return null;
  }
  if (m.bodyPresentation === 'decrypt_error') {
    return (
      <p
        role="alert"
        className="text-destructive min-w-0 text-sm break-words italic whitespace-pre-wrap"
      >
        {m.body ?? ''}
      </p>
    );
  }
  return (
    <p className="min-w-0 text-sm break-words whitespace-pre-wrap">{m.body ?? ''}</p>
  );
}

function formatMessageTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return '';
  }
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  return d.toLocaleString(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Thread message log — **`role="log"`** on the scroll viewport; **empty**, **loading**, and **error**
 * states for production (no placeholder demo content).
 * New rows scroll into view when the tail changes and the user is **pinned to the bottom**; scrolling up releases the pin (**`message:new`** / optimistic sends respect the same rule).
 *
 * **§6 Redux scroll target:** when **`activeConversationId`** matches **`scrollTargetConversationId`** and
 * **`messages`** includes **`scrollTargetMessageId`**, **`useLayoutEffect`** scrolls that row (**`scrollIntoView`**
 * **`{ block: 'nearest' }`**) then **`clearConversationScrollTarget`**. Runs after the pin-to-bottom layout pass.
 * **`scrollTargetNonce`** also bumps when **`setActiveConversationId`** opens that same conversation (**`HomeConversationShell`**
 * list / search) so re-selecting an already-active thread still re-runs this consumer.
 * If the row is not in **`messages`** / DOM yet (**`messageIds`** / **`messagesById`** lag), a **`useEffect`**
 * polls on **`SCROLL_TARGET_RETRY_MS`** until success or **`SCROLL_TARGET_MAX_WAIT_MS`** /
 * **`SCROLL_TARGET_MAX_RETRIES`**, then clears the target to avoid a stuck slice.
 */
export function ThreadMessageList({
  messages,
  conversationScrollKey = null,
  isLoading = false,
  isValidating = false,
  errorMessage = null,
  emptyLabel = 'No messages yet',
  onPeerMessageVisible,
}: ThreadMessageListProps) {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const activeConversationId = useAppSelector((s) => s.messaging.activeConversationId);
  const scrollTargetMessageId = useAppSelector(selectScrollTargetMessageId);
  const scrollTargetConversationId = useAppSelector(selectScrollTargetConversationId);
  const scrollTargetNonce = useAppSelector(selectScrollTargetNonce);
  const messageIdsForScrollTarget = useAppSelector((s) => {
    const c = s.messaging.scrollTargetConversationId?.trim() ?? '';
    if (!c) {
      return EMPTY_MESSAGE_IDS;
    }
    return s.messaging.messageIdsByConversationId[c] ?? EMPTY_MESSAGE_IDS;
  });
  const scrollTargetMessageHydrated = useAppSelector((s) => {
    const mid = s.messaging.scrollTargetMessageId?.trim() ?? '';
    if (!mid) {
      return false;
    }
    return Boolean(s.messaging.messagesById[mid]);
  });

  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const scrollElRef = useRef<HTMLDivElement>(null);
  /** §6: latest row DOM node per **`ThreadMessageItem.id`** (scroll container descendants only). */
  const messageRowElByIdRef = useRef(new Map<string, HTMLElement>());
  const registerMessageRowEl = useCallback((messageId: string, el: HTMLElement | null) => {
    const map = messageRowElByIdRef.current;
    const id = messageId.trim();
    if (!id) {
      return;
    }
    if (el) {
      map.set(id, el);
    } else {
      map.delete(id);
    }
  }, []);
  /** **`true`** when the user is within **`SCROLL_BOTTOM_THRESHOLD_PX`** of the bottom (or we forced scroll). */
  const pinnedToBottomRef = useRef(true);
  const prevConversationKeyRef = useRef<string | null>(null);
  const prevMessageTailRef = useRef<{ len: number; lastId: string | null }>({
    len: 0,
    lastId: null,
  });

  /** Updates **`pinnedToBottomRef`** from scroll position — releases tail-follow when the user scrolls up. */
  const onScrollLog = useCallback(() => {
    const el = scrollElRef.current;
    if (!el) {
      return;
    }
    pinnedToBottomRef.current = isNearBottom(el);
  }, []);

  const applyScrollTargetIfReady = useCallback((): boolean => {
    const msging = store.getState().messaging;
    const active = msging.activeConversationId?.trim() ?? '';
    const cid = msging.scrollTargetConversationId?.trim() ?? '';
    const mid = msging.scrollTargetMessageId?.trim() ?? '';
    if (!active || !cid || !mid || active !== cid) {
      return false;
    }
    const msgs = messagesRef.current;
    if (!msgs.some((m) => m.id === mid)) {
      return false;
    }
    const scrollEl = scrollElRef.current;
    if (!scrollEl) {
      return false;
    }
    const row =
      messageRowElByIdRef.current.get(mid) ?? queryThreadMessageRowInLog(scrollEl, mid);
    if (!row) {
      return false;
    }
    const el = row as HTMLElement;
    if (typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'nearest' });
    }
    pinnedToBottomRef.current = isNearBottom(scrollEl);
    dispatch(clearConversationScrollTarget());
    return true;
  }, [dispatch, store]);

  /**
   * **§6.4 legacy pin-to-bottom** (keep): **(a)** **`conversationScrollKey`** change → jump to tail for a new thread
   * or first non-empty layout; **(b)** same thread, message tail **len / lastId** changes while **`pinnedToBottomRef`**
   * is **`true`** → **`scrollLogToBottom`**. **§6.4 dedupe:** skip **`scrollLogToBottom`** when Redux **`scrollTarget*`** already
   * points at this thread’s **tail** **`Message.id`** (same append as **`message:new` / `send_ack`** §6 row scroll) to avoid
   * double jump. Still pin for optimistic **`client:…`**, media height, and any tail change **without** a matching target.
   */
  useLayoutEffect(() => {
    const el = scrollElRef.current;
    const key = conversationScrollKey ?? '';
    const conversationChanged = prevConversationKeyRef.current !== key;
    prevConversationKeyRef.current = key;

    if (!el) {
      return;
    }

    if (messages.length === 0) {
      prevMessageTailRef.current = { len: 0, lastId: null };
      if (conversationChanged) {
        pinnedToBottomRef.current = true;
      }
      return;
    }

    const lastId = messages[messages.length - 1]!.id;
    const len = messages.length;

    const stMid = scrollTargetMessageId?.trim() ?? '';
    const stCid = scrollTargetConversationId?.trim() ?? '';
    const viewCid = key.trim();
    const activeTrim = activeConversationId?.trim() ?? '';
    const reduxScrollOwnsTail =
      Boolean(stMid && stCid) &&
      (viewCid === stCid || activeTrim === stCid) &&
      lastId === stMid;

    if (conversationChanged) {
      if (!reduxScrollOwnsTail) {
        scrollLogToBottom(el);
      }
      pinnedToBottomRef.current = true;
      prevMessageTailRef.current = { len, lastId };
      return;
    }

    const tailChanged =
      len !== prevMessageTailRef.current.len ||
      lastId !== prevMessageTailRef.current.lastId;
    prevMessageTailRef.current = { len, lastId };

    if (!tailChanged) {
      return;
    }

    if (pinnedToBottomRef.current) {
      if (!reduxScrollOwnsTail) {
        scrollLogToBottom(el);
      }
    }
  }, [
    messages,
    conversationScrollKey,
    activeConversationId,
    scrollTargetMessageId,
    scrollTargetConversationId,
  ]);

  useLayoutEffect(() => {
    void applyScrollTargetIfReady();
  }, [
    applyScrollTargetIfReady,
    activeConversationId,
    messages,
    scrollTargetConversationId,
    scrollTargetMessageId,
    scrollTargetNonce,
  ]);

  useEffect(() => {
    const msging = store.getState().messaging;
    const active = msging.activeConversationId?.trim() ?? '';
    const cid = msging.scrollTargetConversationId?.trim() ?? '';
    const mid = msging.scrollTargetMessageId?.trim() ?? '';
    if (!active || !cid || !mid || active !== cid) {
      return;
    }
    if (applyScrollTargetIfReady()) {
      return;
    }

    let cancelled = false;
    let ticks = 0;
    const t0 = Date.now();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      if (cancelled) {
        return;
      }
      const s = store.getState().messaging;
      const stMid = s.scrollTargetMessageId?.trim() ?? '';
      const stCid = s.scrollTargetConversationId?.trim() ?? '';
      const act = s.activeConversationId?.trim() ?? '';
      if (!stMid || !stCid || act !== stCid) {
        return;
      }
      if (
        Date.now() - t0 > SCROLL_TARGET_MAX_WAIT_MS ||
        ticks >= SCROLL_TARGET_MAX_RETRIES
      ) {
        dispatch(clearConversationScrollTarget());
        return;
      }
      ticks += 1;
      if (applyScrollTargetIfReady()) {
        return;
      }
      timeoutId = setTimeout(tick, SCROLL_TARGET_RETRY_MS);
    };

    timeoutId = setTimeout(tick, SCROLL_TARGET_RETRY_MS);
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
  }, [
    applyScrollTargetIfReady,
    activeConversationId,
    messageIdsForScrollTarget,
    messages,
    scrollTargetConversationId,
    scrollTargetMessageHydrated,
    scrollTargetMessageId,
    scrollTargetNonce,
    dispatch,
    store,
  ]);

  const showInitialLoad = isLoading && messages.length === 0;
  const showEmpty =
    !errorMessage && !showInitialLoad && messages.length === 0;

  if (errorMessage) {
    return (
      <div
        role="alert"
        aria-live="assertive"
        className="border-border bg-background/40 min-w-0 break-words rounded-lg border px-3 py-2 text-sm text-red-600 dark:text-red-400"
      >
        {errorMessage}
      </div>
    );
  }

  if (showInitialLoad) {
    return (
      <p
        className="border-border bg-background/40 text-muted rounded-lg border px-3 py-6 text-center text-sm"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        Loading messages…
      </p>
    );
  }

  if (showEmpty) {
    return (
      <p
        className="border-border bg-background/40 text-muted rounded-lg border px-3 py-6 text-center text-sm"
        role="status"
        aria-live="polite"
      >
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div
        ref={scrollElRef}
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-busy={isValidating}
        data-testid="thread-message-scroll"
        onScroll={onScrollLog}
        className="border-border bg-background/40 min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-contain rounded-xl border px-2 py-3 sm:px-3"
      >
        <div className="flex min-w-0 flex-col gap-3">
          {messages.map((m) => (
            <ThreadMessageRow
              key={m.id}
              m={m}
              onPeerMessageVisible={onPeerMessageVisible}
              registerRowEl={registerMessageRowEl}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
