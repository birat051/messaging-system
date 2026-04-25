import { useSocketWorker } from '../realtime/useSocketWorker';

/**
 * Low-level **`message:send`** over the socket **Web Worker** — same payload as deprecated **`POST /messages`**.
 * Prefer **`@/modules/home/hooks/useSendMessage`** for UI (REST hydrate + optimistic **`Socket.IO`** send).
 * Requires **`SocketWorkerProvider`** above **`useAuth`** consumers.
 */
export function useSocketWorkerSendMessage() {
  const ctx = useSocketWorker();
  if (!ctx) {
    throw new Error(
      'useSocketWorkerSendMessage must be used within SocketWorkerProvider',
    );
  }
  return { sendMessage: ctx.sendMessage };
}
