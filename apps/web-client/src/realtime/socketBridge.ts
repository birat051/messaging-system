import type { MainToWorkerMessage, WorkerToMainMessage } from './socketWorkerProtocol';

/**
 * Creates a dedicated **Web Worker** running **`socket.io-client`** (PROJECT_PLAN.md §3.3).
 */
export function createSocketWorkerBridge(
  onMessage: (msg: WorkerToMainMessage) => void,
): {
  connect: (url: string, userId: string) => void;
  disconnect: () => void;
  terminate: () => void;
} {
  const worker = new Worker(
    new URL('../workers/socketWorker.ts', import.meta.url),
    { type: 'module' },
  );
  worker.onmessage = (ev: MessageEvent<WorkerToMainMessage>) => {
    onMessage(ev.data);
  };
  return {
    connect(url: string, userId: string) {
      const msg: MainToWorkerMessage = { type: 'connect', url, userId };
      worker.postMessage(msg);
    },
    disconnect() {
      worker.postMessage({ type: 'disconnect' } satisfies MainToWorkerMessage);
    },
    terminate() {
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
