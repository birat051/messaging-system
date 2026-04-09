import { useEffect, useRef, useState } from 'react';
import { getSocketUrl } from '../utils/apiConfig';
import {
  createSocketWorkerBridge,
  type PresenceConnectionStatus,
} from '../realtime/socketBridge';
import type { WorkerToMainMessage } from '../realtime/socketWorkerProtocol';

/**
 * Manages Socket.IO in a **Web Worker** + **`presence:heartbeat`** every **5s** while connected.
 * Pass **`userId`** only from an authenticated session (never from env or client-controlled test hooks).
 */
export function usePresenceConnection(userId: string | null): PresenceConnectionStatus {
  const [status, setStatus] = useState<PresenceConnectionStatus>({ kind: 'idle' });
  const bridgeRef = useRef<ReturnType<typeof createSocketWorkerBridge> | null>(null);

  useEffect(() => {
    if (!userId?.trim()) {
      bridgeRef.current?.disconnect();
      bridgeRef.current?.terminate();
      bridgeRef.current = null;
      setStatus({ kind: 'idle' });
      return;
    }

    const bridge = createSocketWorkerBridge((msg: WorkerToMainMessage) => {
      switch (msg.type) {
        case 'connected':
          setStatus({ kind: 'connected', socketId: msg.socketId });
          break;
        case 'disconnected':
          setStatus({ kind: 'disconnected', reason: msg.reason });
          break;
        case 'connect_error':
          setStatus({ kind: 'error', message: msg.message });
          break;
        default:
          break;
      }
    });
    bridgeRef.current = bridge;
    setStatus({ kind: 'connecting' });
    bridge.connect(getSocketUrl(), userId.trim());

    return () => {
      bridge.disconnect();
      bridge.terminate();
      bridgeRef.current = null;
    };
  }, [userId]);

  return status;
}
