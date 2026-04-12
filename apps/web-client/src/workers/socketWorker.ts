/// <reference lib="webworker" />
import { io, type Socket } from 'socket.io-client';
import type {
  MainToWorkerMessage,
  WorkerToMainMessage,
} from '../common/realtime/socketWorkerProtocol';

const HEARTBEAT_MS = 5000;

let socket: Socket | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

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
  }, HEARTBEAT_MS);
}

function connectSocket(msg: Extract<MainToWorkerMessage, { type: 'connect' }>): void {
  clearHeartbeat();
  socket?.disconnect();

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

  socket.on('notification', (payload: unknown) => {
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
}

self.onmessage = (ev: MessageEvent<MainToWorkerMessage>) => {
  const msg = ev.data;

  if (msg.type === 'disconnect') {
    clearHeartbeat();
    socket?.disconnect();
    socket = null;
    post({ type: 'disconnected', reason: 'client' });
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

  if (msg.type === 'connect') {
    connectSocket(msg);
  }
};

export {};
