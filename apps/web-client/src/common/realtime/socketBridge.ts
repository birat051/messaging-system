import type {
  MainToWorkerMessage,
  Message,
  SendMessageRequest,
  WorkerToMainMessage,
} from './socketWorkerProtocol';
import { parseMessageSendAck } from './socketMessageAck';

type PublicWorkerMessage = Exclude<WorkerToMainMessage, { type: 'message_send_ack' }>;

/**
 * Creates a dedicated **Web Worker** running **`socket.io-client`** (PROJECT_PLAN.md §3.3).
 * **`sendMessage`** emits **`message:send`** with the same payload as deprecated **`POST /messages`**.
 */
export function createSocketWorkerBridge(
  onMessage: (msg: PublicWorkerMessage) => void,
): {
  connect: (url: string, userId: string, accessToken: string | null) => void;
  sendMessage: (payload: SendMessageRequest) => Promise<Message>;
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

  worker.onmessage = (ev: MessageEvent<WorkerToMainMessage>) => {
    const msg = ev.data;
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
    disconnect() {
      worker.postMessage({ type: 'disconnect' } satisfies MainToWorkerMessage);
    },
    terminate() {
      pending.clear();
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
