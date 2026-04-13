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
  appendIncomingMessageIfNew,
  mergeReceiptFanoutFromSocket,
} from '@/modules/home/stores/messagingSlice';
import { useAppDispatch } from '@/store/hooks';
import { useSWRConfig } from 'swr';
import { setPresenceStatus } from '@/modules/app/stores/connectionSlice';
import {
  createSocketWorkerBridge,
  type PresenceConnectionStatus,
} from './socketBridge';
import { parseMessageNewPayload } from './socketMessageNew';
import { parseReceiptSocketPayload } from './socketReceiptPayload';
import type {
  Message,
  ReceiptEmitPayload,
  ReceiptEmitSocketEvent,
  SendMessageRequest,
} from './socketWorkerProtocol';

export type SocketWorkerContextValue = {
  status: PresenceConnectionStatus;
  sendMessage: (payload: SendMessageRequest) => Promise<Message>;
  emitReceipt: (event: ReceiptEmitSocketEvent, payload: ReceiptEmitPayload) => Promise<void>;
};

const SocketWorkerContext = createContext<SocketWorkerContextValue | null>(null);

/**
 * Single Socket.IO **Web Worker** bridge per signed-in user — **presence**, **`message:new`**, **`message:send`** acks,
 * and **Feature 12** receipt events (**`message:delivered`**, **`message:read`**, **`conversation:read`**).
 */
export function SocketWorkerProvider({ children }: { children: ReactNode }) {
  const { user, accessToken } = useAuth();
  const userId = user?.id ?? null;
  const dispatch = useAppDispatch();
  const { mutate } = useSWRConfig();
  const [status, setStatus] = useState<PresenceConnectionStatus>({ kind: 'idle' });
  const bridgeRef = useRef<ReturnType<typeof createSocketWorkerBridge> | null>(null);
  /** Dedupe **`message:delivered`** emits per **`messageId`** (inbound peer **`message:new`**). */
  const deliveredAckSentRef = useRef(new Set<string>());

  useEffect(() => {
    if (!userId?.trim()) {
      deliveredAckSentRef.current.clear();
      bridgeRef.current?.disconnect();
      bridgeRef.current?.terminate();
      bridgeRef.current = null;
      setStatus({ kind: 'idle' });
      return;
    }

    const uid = userId.trim();
    const bridge = createSocketWorkerBridge((msg) => {
      switch (msg.type) {
        case 'socket_connecting':
          setStatus({ kind: 'connecting' });
          break;
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
        case 'message_new': {
          const message = parseMessageNewPayload(msg.payload);
          if (!message) {
            if (import.meta.env.DEV) {
              console.warn(
                '[message:new] dropped invalid payload (expected flat Message: id, conversationId, senderId, createdAt, optional body/mediaKey)',
                msg.payload,
              );
            }
            break;
          }
          dispatch(appendIncomingMessageIfNew({ message, currentUserId: uid }));
          void mutate(['conversation-messages', message.conversationId, uid]);
          if (message.senderId !== uid) {
            if (!deliveredAckSentRef.current.has(message.id)) {
              deliveredAckSentRef.current.add(message.id);
              void bridge
                .emitReceipt('message:delivered', {
                  messageId: message.id,
                  conversationId: message.conversationId,
                })
                .catch(() => {
                  deliveredAckSentRef.current.delete(message.id);
                });
            }
          }
          break;
        }
        case 'message_delivered': {
          const p = parseReceiptSocketPayload(msg.payload);
          if (!p) break;
          dispatch(
            mergeReceiptFanoutFromSocket({
              messageId: p.messageId,
              conversationId: p.conversationId,
              actorUserId: p.userId,
              at: p.at,
              kind: 'delivered',
            }),
          );
          break;
        }
        case 'message_read':
        case 'conversation_read': {
          const p = parseReceiptSocketPayload(msg.payload);
          if (!p) break;
          dispatch(
            mergeReceiptFanoutFromSocket({
              messageId: p.messageId,
              conversationId: p.conversationId,
              actorUserId: p.userId,
              at: p.at,
              kind: 'seen',
            }),
          );
          break;
        }
        default:
          break;
      }
    });
    bridgeRef.current = bridge;
    setStatus({ kind: 'connecting' });
    bridge.connect(getSocketUrl(), uid, accessToken ?? null);

    return () => {
      bridge.disconnect();
      bridge.terminate();
      bridgeRef.current = null;
    };
  }, [userId, accessToken, dispatch, mutate]);

  const sendMessage = useCallback((payload: SendMessageRequest) => {
    const b = bridgeRef.current;
    if (!b) {
      return Promise.reject(new Error('Socket worker not ready'));
    }
    return b.sendMessage(payload);
  }, []);

  const emitReceipt = useCallback(
    (event: ReceiptEmitSocketEvent, payload: ReceiptEmitPayload) => {
      const b = bridgeRef.current;
      if (!b) {
        return Promise.reject(new Error('Socket worker not ready'));
      }
      return b.emitReceipt(event, payload);
    },
    [],
  );

  useEffect(() => {
    dispatch(setPresenceStatus(status));
  }, [dispatch, status]);

  const value = useMemo(
    () => ({ status, sendMessage, emitReceipt }),
    [status, sendMessage, emitReceipt],
  );

  return (
    <SocketWorkerContext.Provider value={value}>{children}</SocketWorkerContext.Provider>
  );
}

export function useSocketWorker(): SocketWorkerContextValue | null {
  return useContext(SocketWorkerContext);
}
