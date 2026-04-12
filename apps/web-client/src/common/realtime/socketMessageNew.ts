import type { Message } from './socketWorkerProtocol';

/**
 * Validates a **`message:new`** Socket.IO payload (flat **`Message`**, same as REST).
 */
export function parseMessageNewPayload(input: unknown): Message | null {
  if (typeof input !== 'object' || input === null) return null;
  const o = input as Record<string, unknown>;
  if (typeof o.id !== 'string' || o.id.trim() === '') return null;
  if (typeof o.conversationId !== 'string' || o.conversationId.trim() === '') return null;
  if (typeof o.senderId !== 'string' || o.senderId.trim() === '') return null;
  if (typeof o.createdAt !== 'string' || o.createdAt.trim() === '') return null;
  if (o.body !== undefined && o.body !== null && typeof o.body !== 'string') return null;
  if (o.mediaKey !== undefined && o.mediaKey !== null && typeof o.mediaKey !== 'string') return null;

  const message: Message = {
    id: o.id.trim(),
    conversationId: o.conversationId.trim(),
    senderId: o.senderId.trim(),
    createdAt: o.createdAt,
  };
  if (o.body !== undefined) message.body = o.body === null ? null : o.body;
  if (o.mediaKey !== undefined) message.mediaKey = o.mediaKey === null ? null : o.mediaKey;
  return message;
}
