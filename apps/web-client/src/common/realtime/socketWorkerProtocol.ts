import type { components } from '../../generated/api-types';

export type SendMessageRequest = components['schemas']['SendMessageRequest'];
export type Message = components['schemas']['Message'];

/** Messages from the socket Web Worker → main thread */
export type WorkerToMainMessage =
  | { type: 'connected'; socketId?: string }
  | { type: 'disconnected'; reason: string }
  | { type: 'connect_error'; message: string }
  | { type: 'notification'; payload: unknown }
  | {
      type: 'message_send_ack';
      requestId: string;
      /** Server ack: **`Message`** on success, or **`{ code, message }`** on error */
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
  | { type: 'disconnect' };
