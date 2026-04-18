import { useEffect, useRef, type ReactNode } from 'react';
import {
  ReceiptTicks,
  describeOutboundReceiptStatus,
  type ReceiptTickState,
} from './ReceiptTicks';
import { ThreadMessageMedia } from './ThreadMessageMedia';

export type ThreadMessageItem = {
  id: string;
  body: string;
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

export type ThreadMessageListProps = {
  messages: ThreadMessageItem[];
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
      <div
        className={
          m.isOwn
            ? 'bg-accent text-accent-foreground min-w-0 max-w-full rounded-2xl rounded-br-md px-3 py-2 shadow-sm'
            : 'bg-surface text-foreground border-border min-w-0 max-w-full rounded-2xl rounded-bl-md border px-3 py-2 shadow-sm'
        }
      >
        {bubbleParagraph(m)}
        {m.mediaKey ? (
          <ThreadMessageMedia
            mediaKey={m.mediaKey}
            messageId={m.id}
            isOwn={m.isOwn}
            previewUrlOverride={m.mediaPreviewUrl ?? null}
          />
        ) : null}
      </div>
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
 */
export function ThreadMessageList({
  messages,
  isLoading = false,
  isValidating = false,
  errorMessage = null,
  emptyLabel = 'No messages yet',
  onPeerMessageVisible,
}: ThreadMessageListProps) {
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
        role="log"
        aria-label="Conversation messages"
        aria-live="polite"
        aria-busy={isValidating}
        data-testid="thread-message-scroll"
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
