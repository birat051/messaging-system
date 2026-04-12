import type { components } from '../../generated/api-types';

export type SendMessageRequest = components['schemas']['SendMessageRequest'];
export type Message = components['schemas']['Message'];

/** Inbound receipt emits — **`messageReceiptPayloadSchema`** on **`messaging-service`**. */
export type ReceiptEmitSocketEvent =
  | 'message:delivered'
  | 'message:read'
  | 'conversation:read';

export type ReceiptEmitPayload = {
  messageId: string;
  conversationId: string;
};

/** Messages from the socket Web Worker → main thread */
export type WorkerToMainMessage =
  | { type: 'connected'; socketId?: string }
  | { type: 'disconnected'; reason: string }
  | { type: 'connect_error'; message: string }
  | { type: 'notification'; payload: unknown }
  | { type: 'message_new'; payload: unknown }
  | { type: 'message_delivered'; payload: unknown }
  | { type: 'message_read'; payload: unknown }
  | { type: 'conversation_read'; payload: unknown }
  | {
      type: 'message_send_ack';
      requestId: string;
      /** Server ack: **`Message`** on success, or **`{ code, message }`** on error */
      ack: unknown;
    }
  | {
      type: 'receipt_emit_ack';
      requestId: string;
      ack: unknown;
    };

/** Main thread → worker */
export type MainToWorkerMessage =
  | {
      type: 'connect';
      url: string;
      userId: string;
      /** HS256 access token — required when server uses **`JWT_SECRET`** (same as REST **`Authorization`**). */
      accessToken: string | null;
    }
  | {
      type: 'message_send';
      requestId: string;
      payload: SendMessageRequest;
    }
  | {
      type: 'receipt_emit';
      requestId: string;
      event: ReceiptEmitSocketEvent;
      payload: ReceiptEmitPayload;
    }
  | { type: 'disconnect' };
