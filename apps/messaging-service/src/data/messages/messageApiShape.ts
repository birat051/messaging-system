import type { MessageDocument } from './messages.collection.js';

/**
 * JSON shape for **`Message`** in OpenAPI (REST + Socket.IO **`message:new`** / ack).
 * **Receipt fields are not included** — use **`GET /conversations/{id}/message-receipts`** and Socket.IO
 * receipt events (**`message:delivered`**, **`message:read`**, **`conversation:read`**).
 */
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
