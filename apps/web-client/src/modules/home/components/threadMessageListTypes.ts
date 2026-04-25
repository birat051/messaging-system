import type { ReceiptTickState } from './receiptTickTypes';

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
  /** **Group** aggregate: counts across all recipients (for a group thread a11y + optional subtitle). */
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
  /**
   * **§6.4 — thread identity for legacy pin-to-bottom:** when this changes ( **`HomeConversationShell`** passes
   * **`activeConversationId`** ), the log **`scrollLogToBottom`** once for the new thread and **`pinnedToBottomRef`**
   * resets so **(a)** switching threads lands on the tail, **(b)** first paint with messages starts pinned. Redux
   * **`activeConversationId`** is also read for **`scrollTarget*`**; keep this prop so tests and layout stay
   * explicit without coupling pin logic to the store only.
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
