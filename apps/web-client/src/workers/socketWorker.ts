/// <reference lib="webworker" />
import { io, type Socket } from 'socket.io-client';
import { parseNotificationWorkerPayload } from '../common/realtime/socketNotificationPayload';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../common/realtime/socketWorkerProtocol';
import {
  PRESENCE_HEARTBEAT_COMPACT_MS,
  PRESENCE_HEARTBEAT_RELAXED_MS,
} from '../common/utils/presenceCadence';

let socket: Socket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatIntervalMs = PRESENCE_HEARTBEAT_RELAXED_MS;

function post(msg: WorkerToMainMessage): void {
  self.postMessage(msg);
}

function clearHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function startHeartbeat(): void {
  clearHeartbeat();
  heartbeatTimer = setInterval(() => {
    if (socket?.connected) {
      socket.emit('presence:heartbeat');
    }
  }, heartbeatIntervalMs);
}

function applyHeartbeatMode(mode: 'default' | 'active_thread'): void {
  const next =
    mode === 'active_thread'
      ? PRESENCE_HEARTBEAT_COMPACT_MS
      : PRESENCE_HEARTBEAT_RELAXED_MS;
  if (next === heartbeatIntervalMs) {
    return;
  }
  heartbeatIntervalMs = next;
  if (socket?.connected) {
    startHeartbeat();
  }
}

function connectSocket(msg: Extract<MainToWorkerMessage, { type: 'connect' }>): void {
  clearHeartbeat();
  socket?.disconnect();

  /** Same **`userId`** as Redux **`auth.user.id`** — server joins **`user:<id>`**; must match the recipient of **`message:new`**. */
  const auth: Record<string, string> = { userId: msg.userId };
  if (msg.accessToken?.trim()) {
    auth.token = msg.accessToken.trim();
  }

  socket = io(msg.url, {
    path: '/socket.io',
    auth,
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket.io.on('reconnect_attempt', () => {
    post({ type: 'socket_connecting' });
  });

  socket.on('connect', () => {
    post({ type: 'connected', socketId: socket?.id });
    startHeartbeat();
  });

  socket.on('disconnect', (reason) => {
    clearHeartbeat();
    post({ type: 'disconnected', reason: String(reason) });
  });

  socket.on('connect_error', (err: Error) => {
    post({ type: 'connect_error', message: err.message });
  });

  socket.on('notification', (raw: unknown) => {
    const payload = parseNotificationWorkerPayload(raw);
    if (payload === null) {
      if (import.meta.env.DEV) {
        console.warn(
          '[notification] dropped invalid payload (expected schemaVersion 1 and kind message | call_incoming)',
          raw,
        );
      }
      return;
    }
    post({ type: 'notification', payload });
  });

  socket.on('message:new', (payload: unknown) => {
    post({ type: 'message_new', payload });
  });

  socket.on('message:delivered', (payload: unknown) => {
    post({ type: 'message_delivered', payload });
  });

  socket.on('message:read', (payload: unknown) => {
    post({ type: 'message_read', payload });
  });

  socket.on('conversation:read', (payload: unknown) => {
    post({ type: 'conversation_read', payload });
  });

  socket.on('device:sync_requested', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const o = raw as Record<string, unknown>;
    const newDeviceId = o.newDeviceId;
    const newDevicePublicKey = o.newDevicePublicKey;
    if (typeof newDeviceId !== 'string' || typeof newDevicePublicKey !== 'string') {
      return;
    }
    post({
      type: 'device_sync_requested',
      payload: { newDeviceId, newDevicePublicKey },
    });
  });

  socket.on('device:sync_complete', (raw: unknown) => {
    if (!raw || typeof raw !== 'object') {
      return;
    }
    const o = raw as Record<string, unknown>;
    const targetDeviceId = o.targetDeviceId;
    if (typeof targetDeviceId !== 'string' || targetDeviceId.trim() === '') {
      return;
    }
    post({
      type: 'device_sync_complete',
      payload: { targetDeviceId: targetDeviceId.trim() },
    });
  });

  socket.on('webrtc:offer', (payload: unknown) => {
    post({ type: 'webrtc_inbound', event: 'webrtc:offer', payload });
  });
  socket.on('webrtc:answer', (payload: unknown) => {
    post({ type: 'webrtc_inbound', event: 'webrtc:answer', payload });
  });
  socket.on('webrtc:candidate', (payload: unknown) => {
    post({ type: 'webrtc_inbound', event: 'webrtc:candidate', payload });
  });
  socket.on('webrtc:hangup', (payload: unknown) => {
    post({ type: 'webrtc_inbound', event: 'webrtc:hangup', payload });
  });
}

self.onmessage = (ev: MessageEvent<MainToWorkerMessage>) => {
  const msg = ev.data;

  if (msg.type === 'disconnect') {
    clearHeartbeat();
    heartbeatIntervalMs = PRESENCE_HEARTBEAT_RELAXED_MS;
    socket?.disconnect();
    socket = null;
    post({ type: 'disconnected', reason: 'client' });
    return;
  }

  if (msg.type === 'presence_heartbeat_mode') {
    applyHeartbeatMode(msg.mode);
    return;
  }

  if (msg.type === 'message_send') {
    if (!socket?.connected) {
      post({
        type: 'message_send_ack',
        requestId: msg.requestId,
        ack: {
          code: 'UNAVAILABLE',
          message: 'Socket not connected',
        },
      });
      return;
    }
    socket.emit('message:send', msg.payload, (ack: unknown) => {
      post({ type: 'message_send_ack', requestId: msg.requestId, ack });
    });
    return;
  }

  if (msg.type === 'receipt_emit') {
    if (!socket?.connected) {
      post({
        type: 'receipt_emit_ack',
        requestId: msg.requestId,
        ack: {
          code: 'UNAVAILABLE',
          message: 'Socket not connected',
        },
      });
      return;
    }
    socket.emit(msg.event, msg.payload, (ack: unknown) => {
      post({ type: 'receipt_emit_ack', requestId: msg.requestId, ack });
    });
    return;
  }

  if (msg.type === 'webrtc_emit') {
    if (!socket?.connected) {
      post({
        type: 'webrtc_emit_ack',
        requestId: msg.requestId,
        ack: {
          code: 'UNAVAILABLE',
          message: 'Socket not connected',
        },
      });
      return;
    }
    socket.emit(msg.event, msg.payload, (ack: unknown) => {
      post({ type: 'webrtc_emit_ack', requestId: msg.requestId, ack });
    });
    return;
  }

  if (msg.type === 'presence_get_last_seen') {
    if (!socket?.connected) {
      post({
        type: 'presence_get_last_seen_ack',
        requestId: msg.requestId,
        ack: {
          code: 'UNAVAILABLE',
          message: 'Socket not connected',
        },
      });
      return;
    }
    socket.emit(
      'presence:getLastSeen',
      { targetUserId: msg.targetUserId.trim() },
      (ack: unknown) => {
        post({
          type: 'presence_get_last_seen_ack',
          requestId: msg.requestId,
          ack,
        });
      },
    );
    return;
  }

  if (msg.type === 'connect') {
    connectSocket(msg);
  }
};

export {};
