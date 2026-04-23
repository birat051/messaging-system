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
/** Incremented when replacing or tearing down the Socket.IO client so **`disconnect`** / **`connect`** from the *previous* instance cannot post stale lifecycle events to the main thread. */
let socketConnectGeneration = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let heartbeatIntervalMs = PRESENCE_HEARTBEAT_RELAXED_MS;

/** If the user sends before **`connect`** completes or during reconnect, hold sends here and flush on **`connect`**. */
const MESSAGE_SEND_QUEUE_TIMEOUT_MS = 30_000;

type MessageSendWorkerMsg = Extract<MainToWorkerMessage, { type: 'message_send' }>;

let pendingMessageSendQueue: Array<{
  msg: MessageSendWorkerMsg;
  /** Browser / web worker **`setTimeout`** handle (see **`@types/node`** vs DOM **`Timeout`** mismatch). */
  timeoutId: number;
}> = [];

function clearPendingMessageSendQueue(message: string): void {
  for (const item of pendingMessageSendQueue) {
    clearTimeout(item.timeoutId);
    post({
      type: 'message_send_ack',
      requestId: item.msg.requestId,
      ack: {
        code: 'UNAVAILABLE',
        message,
      },
    });
  }
  pendingMessageSendQueue = [];
}

function emitMessageSend(msg: MessageSendWorkerMsg): void {
  socket!.emit('message:send', msg.payload, (ack: unknown) => {
    post({ type: 'message_send_ack', requestId: msg.requestId, ack });
  });
}

function flushPendingMessageSends(): void {
  while (socket?.connected && pendingMessageSendQueue.length > 0) {
    const item = pendingMessageSendQueue.shift()!;
    clearTimeout(item.timeoutId);
    emitMessageSend(item.msg);
  }
}

function tryMessageSendOrQueue(msg: MessageSendWorkerMsg): void {
  if (socket?.connected) {
    emitMessageSend(msg);
    return;
  }

  const timeoutId = self.setTimeout(() => {
    const idx = pendingMessageSendQueue.findIndex((q) => q.msg.requestId === msg.requestId);
    if (idx < 0) {
      return;
    }
    pendingMessageSendQueue.splice(idx, 1);
    post({
      type: 'message_send_ack',
      requestId: msg.requestId,
      ack: {
        code: 'UNAVAILABLE',
        message: 'Timed out waiting for chat connection',
      },
    });
  }, MESSAGE_SEND_QUEUE_TIMEOUT_MS);

  pendingMessageSendQueue.push({ msg, timeoutId });
}

/** Last successful **`connect`** params — used for token rotation without main-thread bridge teardown. */
let activeConnectParams: {
  url: string;
  userId: string;
  accessToken: string | null;
} | null = null;

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
  socketConnectGeneration++;
  const gen = socketConnectGeneration;

  activeConnectParams = {
    url: msg.url,
    userId: msg.userId,
    accessToken: msg.accessToken ?? null,
  };
  clearHeartbeat();
  /**
   * When we replace the client, the **previous** instance’s real **`disconnect`** is ignored (generation
   * guard). If that socket had **already** dropped (`connected === false`) before we entered here, we
   * previously skipped posting **`disconnected`** and the UI could stay **`connected`** while this
   * handshake runs — **`socket.id`** is often **`undefined`** until **`connect`**, matching
   * **`workerSocketId: null`** on the **new** `io()` client (generation ≥ 2, pre-`connect`).
   * Always clear the badge whenever an instance exists (replacement).
   */
  const previousClient = socket;
  if (previousClient !== null) {
    post({ type: 'disconnected', reason: 'reconnect' });
  }
  previousClient?.disconnect();
  /** Signal connecting before **`io()`** dials (handshake / JWT rotation). */
  post({ type: 'socket_connecting' });

  /** Same **`userId`** as Redux **`auth.user.id`** — server joins **`user:<id>`**; must match the recipient of **`message:new`**. */
  const auth: Record<string, string> = { userId: msg.userId };
  if (msg.accessToken?.trim()) {
    auth.token = msg.accessToken.trim();
  }

  const client = io(msg.url, {
    path: '/socket.io',
    auth,
    transports: ['websocket', 'polling'],
    autoConnect: true,
  });

  socket = client;

  client.io.on('reconnect_attempt', () => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'socket_connecting' });
  });

  client.on('connect', () => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'connected', socketId: client.id });
    startHeartbeat();
    flushPendingMessageSends();
  });

  client.on('disconnect', (reason) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    clearHeartbeat();
    post({ type: 'disconnected', reason: String(reason) });
  });

  client.on('connect_error', (err: Error) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'connect_error', message: err.message });
  });

  client.on('notification', (raw: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
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

  client.on('message:new', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'message_new', payload });
  });

  client.on('message:delivered', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'message_delivered', payload });
  });

  client.on('message:read', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'message_read', payload });
  });

  client.on('conversation:read', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'conversation_read', payload });
  });

  client.on('device:sync_requested', (raw: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
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

  client.on('device:sync_complete', (raw: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
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

  client.on('webrtc:offer', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'webrtc_inbound', event: 'webrtc:offer', payload });
  });
  client.on('webrtc:answer', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'webrtc_inbound', event: 'webrtc:answer', payload });
  });
  client.on('webrtc:candidate', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'webrtc_inbound', event: 'webrtc:candidate', payload });
  });
  client.on('webrtc:hangup', (payload: unknown) => {
    if (gen !== socketConnectGeneration) {
      return;
    }
    post({ type: 'webrtc_inbound', event: 'webrtc:hangup', payload });
  });
}

self.onmessage = (ev: MessageEvent<MainToWorkerMessage>) => {
  const msg = ev.data;

  if (msg.type === 'disconnect') {
    socketConnectGeneration++;
    clearPendingMessageSendQueue('Socket not connected');
    clearHeartbeat();
    heartbeatIntervalMs = PRESENCE_HEARTBEAT_RELAXED_MS;
    activeConnectParams = null;
    socket?.disconnect();
    socket = null;
    post({ type: 'disconnected', reason: 'client' });
    return;
  }

  if (msg.type === 'update_access_token') {
    if (!activeConnectParams) {
      return;
    }
    const next = msg.accessToken ?? null;
    if (activeConnectParams.accessToken === next) {
      return;
    }
    activeConnectParams = { ...activeConnectParams, accessToken: next };
    connectSocket({
      type: 'connect',
      url: activeConnectParams.url,
      userId: activeConnectParams.userId,
      accessToken: activeConnectParams.accessToken,
    });
    return;
  }

  if (msg.type === 'presence_heartbeat_mode') {
    applyHeartbeatMode(msg.mode);
    return;
  }

  if (msg.type === 'message_send') {
    tryMessageSendOrQueue(msg);
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
