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
    ...(msg.encryptedMessageKeys !== undefined
      ? { encryptedMessageKeys: msg.encryptedMessageKeys }
      : {}),
    ...(msg.iv !== undefined ? { iv: msg.iv } : {}),
    ...(msg.algorithm !== undefined ? { algorithm: msg.algorithm } : {}),
  };
}

/** JSON **`Message`** shape for Socket.IO / RabbitMQ fan-out (same as **`messageDocumentToApi`** output). */
export type MessageApiPayload = ReturnType<typeof messageDocumentToApi>;
