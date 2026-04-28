/**
 * Types for **`ReceiptTicks`** (Feature 12 receipt UI).
 * Split from **`ReceiptTicks.tsx`** so the component file is refresh-safe for Fast Refresh.
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
