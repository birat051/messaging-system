/**
 * Validates Socket.IO **`message:delivered`** / **`message:read`** / **`conversation:read`** payloads
 * (**`ReceiptFanoutPayload`** on the wire — **`apps/messaging-service`** **`receiptPublish.ts`**).
 */
export type ReceiptSocketPayload = {
  messageId: string;
  conversationId: string;
  userId: string;
  at: string;
};

export function parseReceiptSocketPayload(input: unknown): ReceiptSocketPayload | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.messageId !== 'string' || o.messageId.trim() === '') return null;
  if (typeof o.conversationId !== 'string' || o.conversationId.trim() === '') return null;
  if (typeof o.userId !== 'string' || o.userId.trim() === '') return null;
  if (typeof o.at !== 'string' || o.at.trim() === '') return null;
  return {
    messageId: o.messageId.trim(),
    conversationId: o.conversationId.trim(),
    userId: o.userId.trim(),
    at: o.at,
  };
}
