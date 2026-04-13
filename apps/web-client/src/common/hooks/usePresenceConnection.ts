import { useSocketWorker } from '../realtime/SocketWorkerProvider';
import {
  mapPresenceToSocketLifecycle,
  type PresenceConnectionStatus,
  type SocketIoLifecycle,
} from '../realtime/socketBridge';

/**
 * Presence / connection status from the shared socket **Web Worker** bridge.
 * Pass **`userId`** only from an authenticated session; when **`null`**, status is **`idle`**.
 * The same status is mirrored into Redux (**`connection.presenceStatus`**) for **`useAppSelector`** / **`selectSocketIoLifecycle`**.
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

/**
 * Socket.IO lifecycle as **`connecting` | `connected` | `disconnected`** for the signed-in session.
 * Returns **`null`** when there is **no** **`userId`** (not a socket lifecycle phase).
 */
export function useSocketIoLifecycle(userId: string | null): SocketIoLifecycle | null {
  const status = usePresenceConnection(userId);
  if (!userId?.trim()) {
    return null;
  }
  return mapPresenceToSocketLifecycle(status);
}
