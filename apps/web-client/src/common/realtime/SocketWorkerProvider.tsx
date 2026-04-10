import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../hooks/useAuth';
import { getSocketUrl } from '../utils/apiConfig';
import {
  createSocketWorkerBridge,
  type PresenceConnectionStatus,
} from './socketBridge';
import type { Message, SendMessageRequest } from './socketWorkerProtocol';

export type SocketWorkerContextValue = {
  status: PresenceConnectionStatus;
  sendMessage: (payload: SendMessageRequest) => Promise<Message>;
};

const SocketWorkerContext = createContext<SocketWorkerContextValue | null>(null);

/**
 * Single Socket.IO **Web Worker** bridge per signed-in user — **presence** + **`message:send`** acks.
 */
export function SocketWorkerProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const userId = user?.id ?? null;
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

    const bridge = createSocketWorkerBridge((msg) => {
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
        case 'notification':
          break;
        default:
          break;
      }
    });
    bridgeRef.current = bridge;
    setStatus({ kind: 'connecting' });
    bridge.connect(getSocketUrl(), userId.trim(), accessToken ?? null);

    return () => {
      bridge.disconnect();
      bridge.terminate();
      bridgeRef.current = null;
    };
  }, [userId, accessToken]);

  const sendMessage = useCallback((payload: SendMessageRequest) => {
    const b = bridgeRef.current;
    if (!b) {
      return Promise.reject(new Error('Socket worker not ready'));
    }
    return b.sendMessage(payload);
  }, []);

  const value = useMemo(
    () => ({ status, sendMessage }),
    [status, sendMessage],
  );

  return (
    <SocketWorkerContext.Provider value={value}>{children}</SocketWorkerContext.Provider>
  );
}

export function useSocketWorker(): SocketWorkerContextValue | null {
  return useContext(SocketWorkerContext);
}
