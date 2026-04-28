import type { GroupReceiptProgress, ReceiptTickState } from './receiptTickTypes';

export function aggregateAriaLabel(
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

/**
 * Plain-language delivery state for **`aria-label`** / status regions (ticks remain supplementary visuals).
 */
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
