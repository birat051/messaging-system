import type {
  MessageReceiptEntry,
  MessageReceiptListRow,
} from './messages.collection.js';

function receiptEntryToApi(entry: MessageReceiptEntry): {
  deliveredAt?: string;
  seenAt?: string;
} {
  const out: { deliveredAt?: string; seenAt?: string } = {};
  if (entry.deliveredAt !== undefined) {
    out.deliveredAt = entry.deliveredAt.toISOString();
  }
  if (entry.seenAt !== undefined) {
    out.seenAt = entry.seenAt.toISOString();
  }
  return out;
}

/** JSON shape for **`MessageReceiptSummary`** in OpenAPI. */
export function messageReceiptSummaryToApi(row: MessageReceiptListRow): {
  messageId: string;
  conversationId: string;
  createdAt: string;
  receiptsByUserId?: Record<string, { deliveredAt?: string; seenAt?: string }>;
} {
  const base = {
    messageId: row.id,
    conversationId: row.conversationId,
    createdAt: row.createdAt.toISOString(),
  };
  const r = row.receiptsByUserId;
  if (r && Object.keys(r).length > 0) {
    return {
      ...base,
      receiptsByUserId: Object.fromEntries(
        Object.entries(r).map(([uid, e]) => [uid, receiptEntryToApi(e)]),
      ),
    };
  }
  return base;
}
