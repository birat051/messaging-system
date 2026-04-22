import { useCallback, useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import {
  ReceiptTicks,
  describeOutboundReceiptStatus,
  type ReceiptTickState,
} from './ReceiptTicks';
import { MessageBubble } from './MessageBubble';
import { ThreadMessageMedia } from './ThreadMessageMedia';

export type ThreadMessageBodyPresentation = 'default' | 'decrypt_error';

export type ThreadMessageItem = {
  id: string;
  body: string;
  /** When **`decrypt_error`**, the bubble is styled as an inline alert (peer decrypt failures). */
  bodyPresentation?: ThreadMessageBodyPresentation;
  /** S3 object key when the row has an attachment (see **`Message.mediaKey`**). */
  mediaKey?: string | null;
  /** Client-only optimistic preview (**`blob:`** or API **`url`**) until public URL from **`mediaKey`** is available. */
  mediaPreviewUrl?: string | null;
  isOwn: boolean;
  /** ISO 8601 from the API (`Message.createdAt`). */
  createdAt: string;
  /** Outbound receipt tick — set for **`isOwn`** rows when **`ReceiptTicks`** is shown. */
  outboundReceipt?: ReceiptTickState;
  /** **Group** aggregate: counts across all recipients (for a11y + optional subtitle). */
  groupReceiptProgress?: {
    delivered: number;
    seen: number;
    total: number;
  } | null;
  /** **Group** only — short progress hint (e.g. `3/5 delivered`). */
  groupReceiptSubtitle?: string | null;
};

/** Pixels from the bottom of the log considered “still at bottom” for auto-scroll. */
const SCROLL_BOTTOM_THRESHOLD_PX = 80;

function isNearBottom(el: HTMLElement): boolean {
  const { scrollTop, scrollHeight, clientHeight } = el;
  return scrollHeight - scrollTop - clientHeight <= SCROLL_BOTTOM_THRESHOLD_PX;
}

function scrollLogToBottom(el: HTMLElement): void {
  el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
}

export type ThreadMessageListProps = {
  messages: ThreadMessageItem[];
  /**
   * When this changes (e.g. **`activeConversationId`**), the log jumps to the **newest** message — new thread context.
   */
  conversationScrollKey?: string | null;
  /** Initial load: show only when there are no messages yet. */
  isLoading?: boolean;
  /** Background revalidation (e.g. SWR) while messages may already be visible. */
  isValidating?: boolean;
  /** Replaces the message log until cleared. */
  errorMessage?: string | null;
  /** Shown when not loading, no error, and there are no messages. */
  emptyLabel?: string;
  /**
   * **Inbound read receipts:** when a **peer** bubble intersects the viewport (50% threshold),
   * emit **`message:read`** from the parent (deduped per **`messageId`**).
   */
  onPeerMessageVisible?: (messageId: string) => void;
};

function ThreadMessageRow({
  m,
  onPeerMessageVisible,
}: {
  m: ThreadMessageItem;
  onPeerMessageVisible?: (messageId: string) => void;
}) {
  const articleRef = useRef<HTMLElement>(null);

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
      ref={articleRef}
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
  const scrollElRef = useRef<HTMLDivElement>(null);
  /** **`true`** when the user is within **`SCROLL_BOTTOM_THRESHOLD_PX`** of the bottom (or we forced scroll). */
  const pinnedToBottomRef = useRef(true);
  const prevConversationKeyRef = useRef<string | null>(null);
  const prevMessageTailRef = useRef<{ len: number; lastId: string | null }>({
    len: 0,
    lastId: null,
  });

  const onScrollLog = useCallback(() => {
    const el = scrollElRef.current;
    if (!el) {
      return;
    }
    pinnedToBottomRef.current = isNearBottom(el);
  }, []);

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

    if (conversationChanged) {
      scrollLogToBottom(el);
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
      scrollLogToBottom(el);
    }
  }, [messages, conversationScrollKey]);

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
            />
          ))}
        </div>
      </div>
    </div>
  );
}
