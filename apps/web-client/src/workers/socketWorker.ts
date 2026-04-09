/// <reference lib="webworker" />
import { io, type Socket } from 'socket.io-client';
import type { MainToWorkerMessage, WorkerToMainMessage } from '../common/realtime/socketWorkerProtocol';

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

self.onmessage = (ev: MessageEvent<MainToWorkerMessage>): void => {
  const msg = ev.data;
  if (msg.type === 'disconnect') {
    clearHeartbeat();
    socket?.disconnect();
    socket = null;
    post({ type: 'disconnected', reason: 'client' });
    return;
  }

  if (msg.type !== 'connect') {
    return;
  }

  clearHeartbeat();
  socket?.disconnect();

  socket = io(msg.url, {
    path: '/socket.io',
    auth: { userId: msg.userId },
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
};

export {};
