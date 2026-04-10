import { useSocketWorker } from '../realtime/SocketWorkerProvider';
import type { PresenceConnectionStatus } from '../realtime/socketBridge';

/**
 * Presence / connection status from the shared socket **Web Worker** bridge.
 * Pass **`userId`** only from an authenticated session; when **`null`**, status is **`idle`**.
 */
export function usePresenceConnection(userId: string | null): PresenceConnectionStatus {
  const ctx = useSocketWorker();
  if (!userId?.trim()) {
    return { kind: 'idle' };
  }
  if (!ctx) {
    return { kind: 'idle' };
  }
  return ctx.status;
}
