import { useSocketWorker } from '../realtime/SocketWorkerProvider';

/**
 * **`message:send`** over the socket **Web Worker** — same payload as deprecated **`POST /messages`**.
 * Requires **`SocketWorkerProvider`** above **`useAuth`** consumers.
 */
export function useSendMessage() {
  const ctx = useSocketWorker();
  if (!ctx) {
    throw new Error('useSendMessage must be used within SocketWorkerProvider');
  }
  return { sendMessage: ctx.sendMessage };
}
