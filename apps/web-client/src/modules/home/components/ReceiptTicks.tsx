/**
 * Presentational **sent → delivered → seen** ticks for outbound bubbles (**Feature 12**).
 * Semantics: **`docs/MESSAGE_RECEIPTS_AND_READ_STATE_DESIGN.md`** — **sent** (persisted), **delivered**, **seen**.
 */
export type ReceiptTickState =
  | 'loading'
  | 'unknown'
  | 'sent'
  | 'delivered'
  | 'seen';

export type GroupReceiptProgress = {
  delivered: number;
  seen: number;
  total: number;
};

export type ReceiptTicksProps = {
  state: ReceiptTickState;
  className?: string;
  /** **Group** aggregate — drives accessible name when **`total > 1`**. */
  groupProgress?: GroupReceiptProgress | null;
  /** Optional muted hint next to ticks (e.g. partial delivery). */
  groupSubtitle?: string | null;
  /**
   * When **true**, tick marks are **decorative**; a parent **`role="status"`** (or similar) must expose
   * the delivery state in **text** so icons are not the sole indicator (**a11y**).
   */
  decorative?: boolean;
};

/** Plain-language delivery state for **`aria-label`** / status regions (ticks remain supplementary visuals). */
export function describeOutboundReceiptStatus(
  state: ReceiptTickState,
  groupSubtitle?: string | null,
  groupProgress?: GroupReceiptProgress | null,
): string {
  if (groupProgress && groupProgress.total > 1) {
    const aggregate = aggregateAriaLabel(state, groupProgress);
    if (aggregate) return aggregate;
  }
  const core: Record<ReceiptTickState, string> = {
    loading: 'Sending message',
    unknown: 'Receipt status unknown',
    sent: 'Sent',
    delivered: 'Delivered',
    seen: 'Seen',
  };
  let text = core[state];
  if (groupSubtitle?.trim()) {
    text = `${text}. ${groupSubtitle.trim()}`;
  }
  return text;
}

function aggregateAriaLabel(
  state: ReceiptTickState,
  g: GroupReceiptProgress,
): string | null {
  const { delivered, seen, total } = g;
  if (total <= 1) return null;
  if (state === 'seen') return `Seen by all ${total} members`;
  if (state === 'delivered') return `Delivered to all ${total} members`;
  if (seen > 0) return `Seen by ${seen} of ${total} members`;
  if (delivered > 0) return `Delivered to ${delivered} of ${total} members`;
  return 'Sent; awaiting receipt updates from members';
}

function IconSingleTick({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 16 16"
      width={16}
      height={16}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8.2 5.8 11 13 3.5" />
    </svg>
  );
}

function IconDoubleTick({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 18 16"
      width={18}
      height={16}
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1 8.2 3.8 11 11 3.5" />
      <path d="M5 8.2 7.8 11 15 3.5" />
    </svg>
  );
}

function a11yShell(
  decorative: boolean,
  standalone: Record<string, unknown> | null,
): Record<string, unknown> {
  if (decorative) {
    return { 'aria-hidden': true as const };
  }
  return standalone ?? {};
}

export function ReceiptTicks({
  state,
  className = '',
  groupProgress = null,
  groupSubtitle = null,
  decorative = false,
}: ReceiptTicksProps) {
  const base = `inline-flex shrink-0 items-center justify-end ${className}`.trim();
  const aggregate = groupProgress ? aggregateAriaLabel(state, groupProgress) : null;

  if (state === 'loading') {
    return (
      <span
        data-testid="receipt-ticks"
        className={`text-muted ${base}`}
        {...a11yShell(decorative, {
          role: 'status',
          'aria-busy': true,
          'aria-live': 'polite',
          'aria-label': aggregate ?? 'Loading receipt status',
        })}
      >
        <span className="border-muted-foreground/50 size-3 animate-spin rounded-full border-2 border-t-transparent" />
      </span>
    );
  }

  if (state === 'unknown') {
    return (
      <span
        data-testid="receipt-ticks"
        className={`text-muted ${base}`}
        {...a11yShell(decorative, {
          role: 'img',
          'aria-label': aggregate ?? 'Receipt status unknown',
        })}
      >
        <span className="text-[0.65rem] font-medium leading-none" aria-hidden="true">
          —
        </span>
      </span>
    );
  }

  if (state === 'sent') {
    return (
      <span
        data-testid="receipt-ticks"
        className={`text-muted-foreground inline-flex max-w-full flex-wrap items-center justify-end gap-1 ${base}`}
        {...a11yShell(decorative, null)}
      >
        <span role="img" aria-label={aggregate ?? 'Sent'} className="inline-flex">
          <IconSingleTick className="opacity-90" />
        </span>
        {groupSubtitle ? (
          <span className="text-muted max-w-[10rem] truncate text-[0.65rem] leading-none">
            {groupSubtitle}
          </span>
        ) : null}
      </span>
    );
  }

  if (state === 'delivered') {
    return (
      <span
        data-testid="receipt-ticks"
        className={`text-muted-foreground inline-flex max-w-full flex-wrap items-center justify-end gap-1 ${base}`}
        {...a11yShell(decorative, null)}
      >
        <span role="img" aria-label={aggregate ?? 'Delivered'} className="inline-flex">
          <IconDoubleTick className="opacity-90" />
        </span>
        {groupSubtitle ? (
          <span className="text-muted max-w-[10rem] truncate text-[0.65rem] leading-none">
            {groupSubtitle}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <span
      data-testid="receipt-ticks"
      className={`text-accent ${base}`}
      {...a11yShell(decorative, {
        role: 'img',
        'aria-label': aggregate ?? 'Seen',
      })}
    >
      <IconDoubleTick className="opacity-95" />
    </span>
  );
}
