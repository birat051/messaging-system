import type { MessageDocument } from './types.js';

/** JSON shape for **`Message`** in OpenAPI (REST + Socket.IO ack). */
export function messageDocumentToApi(msg: MessageDocument) {
  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    body: msg.body,
    mediaKey: msg.mediaKey,
    createdAt: msg.createdAt.toISOString(),
  };
}
