import type { components } from '../../generated/api-types';
import type { ParsedNotificationPayload } from './socketNotificationPayload';

export type SendMessageRequest = components['schemas']['SendMessageRequest'];
export type Message = components['schemas']['Message'];

export type { ParsedNotificationPayload } from './socketNotificationPayload';

/** Inbound receipt emits — **`messageReceiptPayloadSchema`** on **`messaging-service`**. */
export type ReceiptEmitSocketEvent =
  | 'message:delivered'
  | 'message:read'
  | 'conversation:read';

export type ReceiptEmitPayload = {
  messageId: string;
  conversationId: string;
};

export type WebRtcSignalingEmitEvent =
  | 'webrtc:offer'
  | 'webrtc:answer'
  | 'webrtc:candidate'
  | 'webrtc:hangup';

/** Server **`device:sync_requested`** emit (new **`(userId, deviceId)`** row on **`POST /users/me/devices`**). */
export type DeviceSyncRequestedPayload = {
  newDeviceId: string;
  newDevicePublicKey: string;
};

/** Server **`device:sync_complete`** emit (after **`POST /users/me/sync/message-keys`** applied keys for **`targetDeviceId`**). */
export type DeviceSyncCompletePayload = {
  targetDeviceId: string;
};

/** Messages from the socket Web Worker → main thread */
export type WorkerToMainMessage =
  | { type: 'socket_connecting' }
  | { type: 'connected'; socketId?: string }
  | { type: 'disconnected'; reason: string }
  | { type: 'connect_error'; message: string }
  /** **`payload.kind`** — **`message`** \| **`call_incoming`** (parsed in **`socketWorker`**). */
  | { type: 'notification'; payload: ParsedNotificationPayload }
  | { type: 'message_new'; payload: unknown }
  | { type: 'message_delivered'; payload: unknown }
  | { type: 'message_read'; payload: unknown }
  | { type: 'conversation_read'; payload: unknown }
  | { type: 'device_sync_requested'; payload: DeviceSyncRequestedPayload }
  | { type: 'device_sync_complete'; payload: DeviceSyncCompletePayload }
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
    }
  | {
      type: 'webrtc_emit_ack';
      requestId: string;
      ack: unknown;
    }
  | {
      type: 'presence_get_last_seen_ack';
      requestId: string;
      ack: unknown;
    }
  | {
      type: 'webrtc_inbound';
      event: WebRtcSignalingEmitEvent;
      payload: unknown;
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
  /**
   * Apply a rotated access token without tearing down the worker bridge on the main thread.
   * Worker reconnects the Socket.IO client with fresh **`auth`** (same **`userId`** / URL).
   */
  | {
      type: 'update_access_token';
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
  | {
      type: 'webrtc_emit';
      requestId: string;
      event: WebRtcSignalingEmitEvent;
      payload: unknown;
    }
  | {
      type: 'presence_get_last_seen';
      requestId: string;
      /** User id to resolve last-seen for (server **`resolveLastSeenForUser`**). */
      targetUserId: string;
    }
  | {
      type: 'presence_heartbeat_mode';
      /** **`active_thread`** → compact interval (server-throttle-safe); **`default`** → relaxed. */
      mode: 'default' | 'active_thread';
    }
  | { type: 'disconnect' };
