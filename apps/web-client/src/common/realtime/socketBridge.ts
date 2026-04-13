import type {
  MainToWorkerMessage,
  Message,
  ReceiptEmitPayload,
  ReceiptEmitSocketEvent,
  SendMessageRequest,
  WorkerToMainMessage,
} from './socketWorkerProtocol';
import { parseMessageSendAck } from './socketMessageAck';
import { parseReceiptEmitAck } from './socketReceiptEmitAck';

type PublicWorkerMessage = Exclude<
  WorkerToMainMessage,
  { type: 'message_send_ack' } | { type: 'receipt_emit_ack' }
>;

/**
 * Creates a dedicated **Web Worker** running **`socket.io-client`** (PROJECT_PLAN.md §3.3).
 * **`sendMessage`** emits **`message:send`** with the same payload as deprecated **`POST /messages`**.
 */
export function createSocketWorkerBridge(
  onMessage: (msg: PublicWorkerMessage) => void,
): {
  connect: (url: string, userId: string, accessToken: string | null) => void;
  sendMessage: (payload: SendMessageRequest) => Promise<Message>;
  emitReceipt: (event: ReceiptEmitSocketEvent, payload: ReceiptEmitPayload) => Promise<void>;
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

  worker.onmessage = (ev: MessageEvent<WorkerToMainMessage>) => {
    const msg = ev.data;
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
    disconnect() {
      worker.postMessage({ type: 'disconnect' } satisfies MainToWorkerMessage);
    },
    terminate() {
      pending.clear();
      pendingReceipt.clear();
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
