import { publishMessage } from './rabbitmq.js';

export type ReceiptSocketEvent =
  | 'message:delivered'
  | 'message:read'
  | 'conversation:read';

/** Wire payload for **`message.receipt.*`** broker messages → Socket.IO emit. */
export type ReceiptFanoutPayload = {
  messageId: string;
  conversationId: string;
  /** Actor (recipient) whose receipt state changed — **server-authoritative** (not client-supplied). */
  userId: string;
  at: string;
};

/**
 * Cross-node fan-out: each participant receives **`message.receipt.<userId>`** so every replica’s
 * consumer can **`io.to('user:<id>')`** emit. **`skipSocketId`** only on the **actor’s** routing key
 * (same pattern as **`message:send`** sender echo).
 */
export async function publishReceiptToParticipants(params: {
  participantIds: string[];
  actorUserId: string;
  socketEvent: ReceiptSocketEvent;
  data: ReceiptFanoutPayload;
  originSocketId?: string;
}): Promise<void> {
  const bodyBase = {
    socketEvent: params.socketEvent,
    data: params.data,
  };
  for (const pid of params.participantIds) {
    const skipSocketId =
      pid === params.actorUserId && params.originSocketId !== undefined
        ? params.originSocketId
        : undefined;
    await publishMessage(`message.receipt.${pid}`, {
      ...bodyBase,
      skipSocketId,
    });
  }
}
