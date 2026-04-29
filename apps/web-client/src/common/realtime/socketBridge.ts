import type {
  MainToWorkerMessage,
  Message,
  ReceiptEmitPayload,
  ReceiptEmitSocketEvent,
  SendMessageRequest,
  WebRtcSignalingEmitEvent,
  WorkerToMainMessage,
} from './socketWorkerProtocol';
import { parseMessageSendAck } from './socketMessageAck';
import {
  parsePresenceGetLastSeenAck,
  type PresenceLastSeenResult,
} from './parsePresenceGetLastSeenAck';
import { parseReceiptEmitAck } from './socketReceiptEmitAck';
import { parseWebRtcEmitAck } from './parseWebRtcEmitAck';

export type { PresenceLastSeenResult } from './parsePresenceGetLastSeenAck';

type PublicWorkerMessage = Exclude<
  WorkerToMainMessage,
  | { type: 'message_send_ack' }
  | { type: 'receipt_emit_ack' }
  | { type: 'webrtc_emit_ack' }
  | { type: 'presence_get_last_seen_ack' }
>;

/**
 * Creates a dedicated **Web Worker** running **`socket.io-client`** (PROJECT_PLAN.md §3.3).
 * **`sendMessage`** emits **`message:send`** with the same payload as deprecated **`POST /messages`**.
 * Inbound **`notification`** is parsed in the worker (**`parseNotificationWorkerPayload`**) before **`onMessage`** (**`payload.kind`** discriminates **`message`** vs **`call_incoming`**).
 */
export type WebRtcInboundMessage = {
  event: WebRtcSignalingEmitEvent;
  payload: unknown;
};

export function createSocketWorkerBridge(
  onMessage: (msg: PublicWorkerMessage) => void,
  options?: {
    onWebRtcInbound?: (msg: WebRtcInboundMessage) => void;
  },
): {
  connect: (url: string, userId: string, accessToken: string | null) => void;
  sendMessage: (payload: SendMessageRequest) => Promise<Message>;
  emitReceipt: (event: ReceiptEmitSocketEvent, payload: ReceiptEmitPayload) => Promise<void>;
  emitWebRtcSignaling: (
    event: WebRtcSignalingEmitEvent,
    payload: unknown,
  ) => Promise<void>;
  getLastSeen: (targetUserId: string) => Promise<PresenceLastSeenResult>;
  setPresenceHeartbeatMode: (mode: 'default' | 'active_thread') => void;
  disconnect: () => void;
  terminate: () => void;
} {
  const worker = new Worker(
    new URL('../../workers/socketWorker.ts', import.meta.url),
    { type: 'module' },
  );

  const pending = new Map<
    string,
    { resolve: (m: Message) => void; reject: (e: Error) => void }
  >();

  const pendingReceipt = new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void }
  >();

  const pendingWebRtc = new Map<
    string,
    { resolve: () => void; reject: (e: Error) => void }
  >();

  const pendingGetLastSeen = new Map<
    string,
    {
      resolve: (v: PresenceLastSeenResult) => void;
      reject: (e: Error) => void;
    }
  >();

  worker.onmessage = (ev: MessageEvent<WorkerToMainMessage>) => {
    const msg = ev.data;
    if (msg.type === 'presence_get_last_seen_ack') {
      const entry = pendingGetLastSeen.get(msg.requestId);
      if (!entry) {
        return;
      }
      pendingGetLastSeen.delete(msg.requestId);
      const parsed = parsePresenceGetLastSeenAck(msg.ack);
      if (parsed.ok) {
        entry.resolve(parsed.value);
      } else {
        entry.reject(parsed.error);
      }
      return;
    }
    if (msg.type === 'webrtc_emit_ack') {
      const entry = pendingWebRtc.get(msg.requestId);
      if (!entry) {
        return;
      }
      pendingWebRtc.delete(msg.requestId);
      const parsed = parseWebRtcEmitAck(msg.ack);
      if (parsed.ok) {
        entry.resolve();
      } else {
        entry.reject(parsed.error);
      }
      return;
    }
    if (msg.type === 'webrtc_inbound') {
      options?.onWebRtcInbound?.({
        event: msg.event,
        payload: msg.payload,
      });
      return;
    }
    if (msg.type === 'receipt_emit_ack') {
      const entry = pendingReceipt.get(msg.requestId);
      if (!entry) {
        return;
      }
      pendingReceipt.delete(msg.requestId);
      const parsed = parseReceiptEmitAck(msg.ack);
      if (parsed.ok) {
        entry.resolve();
      } else {
        entry.reject(parsed.error);
      }
      return;
    }
    if (msg.type === 'message_send_ack') {
      const entry = pending.get(msg.requestId);
      if (!entry) {
        return;
      }
      pending.delete(msg.requestId);
      const parsed = parseMessageSendAck(msg.ack);
      if (parsed.ok) {
        entry.resolve(parsed.message);
      } else {
        entry.reject(parsed.error);
      }
      return;
    }
    onMessage(msg);
  };

  return {
    connect(url: string, userId: string, accessToken: string | null) {
      const msg: MainToWorkerMessage = {
        type: 'connect',
        url,
        userId,
        accessToken,
      };
      worker.postMessage(msg);
    },
    sendMessage(payload: SendMessageRequest) {
      return new Promise<Message>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        pending.set(requestId, { resolve, reject });
        worker.postMessage({
          type: 'message_send',
          requestId,
          payload,
        } satisfies MainToWorkerMessage);
      });
    },
    emitReceipt(event: ReceiptEmitSocketEvent, payload: ReceiptEmitPayload) {
      return new Promise<void>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        pendingReceipt.set(requestId, { resolve, reject });
        worker.postMessage({
          type: 'receipt_emit',
          requestId,
          event,
          payload,
        } satisfies MainToWorkerMessage);
      });
    },
    emitWebRtcSignaling(event: WebRtcSignalingEmitEvent, payload: unknown) {
      return new Promise<void>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        pendingWebRtc.set(requestId, { resolve, reject });
        worker.postMessage({
          type: 'webrtc_emit',
          requestId,
          event,
          payload,
        } satisfies MainToWorkerMessage);
      });
    },
    getLastSeen(targetUserId: string) {
      return new Promise<PresenceLastSeenResult>((resolve, reject) => {
        const requestId = crypto.randomUUID();
        pendingGetLastSeen.set(requestId, { resolve, reject });
        worker.postMessage({
          type: 'presence_get_last_seen',
          requestId,
          targetUserId,
        } satisfies MainToWorkerMessage);
      });
    },
    setPresenceHeartbeatMode(mode: 'default' | 'active_thread') {
      worker.postMessage({
        type: 'presence_heartbeat_mode',
        mode,
      } satisfies MainToWorkerMessage);
    },
    disconnect() {
      worker.postMessage({ type: 'disconnect' } satisfies MainToWorkerMessage);
    },
    terminate() {
      pending.clear();
      pendingReceipt.clear();
      pendingWebRtc.clear();
      pendingGetLastSeen.clear();
      worker.terminate();
    },
  };
}

export type PresenceConnectionStatus =
  | { kind: 'idle' }
  | { kind: 'connecting' }
  | { kind: 'connected'; socketId?: string }
  | { kind: 'disconnected'; reason: string }
  | { kind: 'error'; message: string };

/** Collapsed Socket.IO lifecycle for UI (signed-in session only). */
export type SocketIoLifecycle = 'connecting' | 'connected' | 'disconnected';

/**
 * Maps full presence status to **`connecting` | `connected` | `disconnected`** (**`idle`** is not a socket phase — callers use **`userId`**).
 * **`error`** is treated as **`disconnected`** (connection not usable).
 */
export function mapPresenceToSocketLifecycle(
  status: PresenceConnectionStatus,
): SocketIoLifecycle {
  switch (status.kind) {
    case 'idle':
      return 'disconnected';
    case 'connecting':
      return 'connecting';
    case 'connected':
      return 'connected';
    case 'disconnected':
    case 'error':
      return 'disconnected';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
