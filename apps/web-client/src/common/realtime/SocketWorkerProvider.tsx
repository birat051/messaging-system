import {
  useCallback,
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
import { useStore } from 'react-redux';
import {
  evaluateDeviceSyncBootstrapState,
  messageHasDeviceWrappedKey,
} from '@/common/crypto/deviceBootstrapSync';
import { revalidateConversationMessagesForUser } from '@/common/realtime/revalidateConversationMessages';
import { syncRequested } from '@/modules/crypto/stores/cryptoSlice';
import { invalidateDevicePublicKeys } from '@/modules/crypto/stores/devicePublicKeysSlice';
import { useAppDispatch } from '@/store/hooks';
import { useSWRConfig } from 'swr';
import { setPresenceStatus } from '@/modules/app/stores/connectionSlice';
import { presenceClearedForUser } from '@/modules/app/stores/presenceSlice';
import { clearInboundToastDedupe } from '@/common/notifications/inboundToastDedupe';
import {
  appendInboundNotification,
  resetNotifications,
} from '@/modules/app/stores/notificationsSlice';
import { InboundNotificationListener } from '@/common/notifications/InboundNotificationListener';
import {
  createSocketWorkerBridge,
  type PresenceConnectionStatus,
  type WebRtcInboundMessage,
} from './socketBridge';
import { incomingCallRinging } from '@/modules/home/stores/callSlice';
import { parseMessageNewPayload } from './socketMessageNew';
import { parseReceiptSocketPayload } from './socketReceiptPayload';
import type {
  ReceiptEmitPayload,
  ReceiptEmitSocketEvent,
  SendMessageRequest,
} from './socketWorkerProtocol';
import { SocketWorkerContext } from './socketWorkerContext';
import { bumpConversationInListCache } from '@/modules/home/utils/conversationListCache';
import type { AppDispatch, RootState } from '@/store/store';

/**
 * Single Socket.IO **Web Worker** bridge per signed-in user — **presence**, **`message:new`**, **`message:send`** acks,
 * and **Feature 12** receipt events (**`message:delivered`**, **`message:read`**, **`conversation:read`**).
 */
export function SocketWorkerProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const dispatch = useAppDispatch();
  const reduxStore = useStore<RootState>();
  const { mutate } = useSWRConfig();
  /** Stable ref so the socket bootstrap effect does not re-run when SWR’s **`mutate`** identity changes. */
  const mutateRef = useRef(mutate);
  mutateRef.current = mutate;
  const [status, setStatus] = useState<PresenceConnectionStatus>({ kind: 'idle' });
  const bridgeRef = useRef<ReturnType<typeof createSocketWorkerBridge> | null>(null);
  const webRtcInboundHandlerRef = useRef<
    ((msg: WebRtcInboundMessage) => void) | null
  >(null);
  /** Dedupe **`message:delivered`** emits per **`messageId`** (inbound peer **`message:new`**). */
  const deliveredAckSentRef = useRef(new Set<string>());

  useEffect(() => {
    if (!userId?.trim()) {
      clearInboundToastDedupe();
      dispatch(resetNotifications());
      deliveredAckSentRef.current.clear();
      bridgeRef.current?.disconnect();
      bridgeRef.current?.terminate();
      bridgeRef.current = null;
      const idle: PresenceConnectionStatus = { kind: 'idle' };
      setStatus(idle);
      dispatch(setPresenceStatus(idle));
      return;
    }

    const uid = userId.trim();
    /** Keep **`connection.presenceStatus`** (badge) aligned with Context **`status`** — no deferred **`useEffect`** lag. */
    const applyPresenceStatus = (next: PresenceConnectionStatus) => {
      setStatus(next);
      dispatch(setPresenceStatus(next));
    };

    const bridge = createSocketWorkerBridge(
      (msg) => {
      switch (msg.type) {
        case 'socket_connecting':
          applyPresenceStatus({ kind: 'connecting' });
          break;
        case 'connected':
          applyPresenceStatus({ kind: 'connected', socketId: msg.socketId });
          break;
        case 'disconnected':
          applyPresenceStatus({ kind: 'disconnected', reason: msg.reason });
          break;
        case 'connect_error':
          applyPresenceStatus({ kind: 'error', message: msg.message });
          break;
        case 'notification': {
          dispatch(appendInboundNotification(msg.payload));
          break;
        }
        case 'message_new': {
          const message = parseMessageNewPayload(msg.payload);
          if (!message) {
            if (import.meta.env.DEV) {
              console.warn(
                '[message:new] dropped invalid payload (expected flat Message: id, conversationId, senderId, createdAt, optional body/mediaKey/iv/algorithm/encryptedMessageKeys)',
                msg.payload,
              );
            }
            break;
          }
          /** Use **current** session from the store — not the effect closure — so reconnect / token races don’t compare the wrong user and emit **`message:delivered`** on your own message (**`FORBIDDEN`**). */
          const viewerId =
            reduxStore.getState().auth.user?.id?.trim() ?? '';
          if (!viewerId) {
            break;
          }
          dispatch(appendIncomingMessageIfNew({ message, currentUserId: viewerId }));
          void mutateRef.current([
            'conversation-messages',
            message.conversationId,
            viewerId,
          ]);
          bumpConversationInListCache(
            mutateRef.current,
            viewerId,
            message.conversationId,
            message.createdAt,
          );
          {
            const activeId =
              reduxStore.getState().messaging.activeConversationId?.trim() ?? '';
            if (
              activeId.length > 0 &&
              message.conversationId === activeId &&
              message.senderId !== viewerId
            ) {
              dispatch(
                presenceClearedForUser({ userId: message.senderId }),
              );
            }
          }
          {
            const st = reduxStore.getState();
            const { syncState, deviceId } = st.crypto;
            const did = deviceId?.trim() ?? '';
            if (
              (syncState === 'pending' || syncState === 'in_progress') &&
              did.length > 0 &&
              messageHasDeviceWrappedKey(message, did)
            ) {
              void evaluateDeviceSyncBootstrapState(
                reduxStore.dispatch as AppDispatch,
                did,
              );
            }
          }
          if (message.senderId !== viewerId) {
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
        case 'device_sync_requested': {
          const myDeviceId = reduxStore.getState().crypto.deviceId?.trim() ?? '';
          if (
            myDeviceId.length > 0 &&
            msg.payload.newDeviceId.trim() === myDeviceId
          ) {
            break;
          }
          // Another device joined the account — invalidate sender directory cache so hybrid
          // send refetches **`GET …/me/devices/public-keys`** and wraps for every device row.
          dispatch(invalidateDevicePublicKeys('me'));
          dispatch(syncRequested(msg.payload));
          break;
        }
        case 'device_sync_complete': {
          const myDeviceId = reduxStore.getState().crypto.deviceId?.trim() ?? '';
          const target = msg.payload.targetDeviceId.trim();
          if (myDeviceId.length === 0 || target !== myDeviceId) {
            break;
          }
          const sync = reduxStore.getState().crypto.syncState;
          if (sync !== 'pending' && sync !== 'in_progress') {
            break;
          }
          void evaluateDeviceSyncBootstrapState(
            reduxStore.dispatch as AppDispatch,
            myDeviceId,
            {
              getState: () => reduxStore.getState().crypto,
              onHistoryMayDecryptNow: () =>
                revalidateConversationMessagesForUser(
                  mutateRef.current,
                  reduxStore.getState().auth.user?.id?.trim() ?? '',
                ),
            },
          );
          break;
        }
        default:
          break;
      }
    },
    {
      onWebRtcInbound: (inbound) => {
        if (inbound.event === 'webrtc:offer') {
          const raw = inbound.payload;
          if (
            raw !== null &&
            typeof raw === 'object' &&
            'fromUserId' in raw &&
            'callId' in raw &&
            'sdp' in raw
          ) {
            const p = raw as {
              fromUserId: unknown;
              callId: unknown;
              sdp: unknown;
              callerDisplayName?: unknown;
              callerUsername?: unknown;
            };
            const remoteSdp = typeof p.sdp === 'string' ? p.sdp : '';
            const peerUserId =
              typeof p.fromUserId === 'string' ? p.fromUserId : '';
            const callId = typeof p.callId === 'string' ? p.callId : '';
            const peerDisplayName =
              typeof p.callerDisplayName === 'string'
                ? p.callerDisplayName
                : null;
            const peerUsername =
              typeof p.callerUsername === 'string' ? p.callerUsername : null;
            if (remoteSdp.length > 0 && peerUserId.length > 0 && callId.length > 0) {
              dispatch(
                incomingCallRinging({
                  peerUserId,
                  callId,
                  remoteSdp,
                  peerDisplayName,
                  peerUsername,
                }),
              );
            }
          }
        }
        webRtcInboundHandlerRef.current?.(inbound);
      },
    },
    );
    bridgeRef.current = bridge;
    applyPresenceStatus({ kind: 'connecting' });
    /** Handshake JWT only — messaging-service resolves **`socket.data.authAtConnect` once**; REST may rotate access tokens without socket reconnect. */
    const initialToken =
      reduxStore.getState().auth.accessToken ?? null;
    bridge.connect(getSocketUrl(), uid, initialToken);

    return () => {
      bridge.disconnect();
      bridge.terminate();
      bridgeRef.current = null;
    };
  }, [userId, dispatch, reduxStore]);

  const setWebRtcInboundHandler = useCallback(
    (handler: ((msg: WebRtcInboundMessage) => void) | null) => {
      webRtcInboundHandlerRef.current = handler;
    },
    [],
  );

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

  const emitWebRtcSignaling = useCallback(
    (
      event:
        | 'webrtc:offer'
        | 'webrtc:answer'
        | 'webrtc:candidate'
        | 'webrtc:hangup',
      payload: unknown,
    ) => {
      const b = bridgeRef.current;
      if (!b) {
        return Promise.reject(new Error('Socket worker not ready'));
      }
      return b.emitWebRtcSignaling(event, payload);
    },
    [],
  );

  const getLastSeen = useCallback((targetUserId: string) => {
    const b = bridgeRef.current;
    if (!b) {
      return Promise.reject(new Error('Socket worker not ready'));
    }
    return b.getLastSeen(targetUserId);
  }, []);

  const setPresenceHeartbeatMode = useCallback(
    (mode: 'default' | 'active_thread') => {
      bridgeRef.current?.setPresenceHeartbeatMode(mode);
    },
    [],
  );

  const value = useMemo(
    () => ({
      status,
      sendMessage,
      emitReceipt,
      emitWebRtcSignaling,
      getLastSeen,
      setPresenceHeartbeatMode,
      setWebRtcInboundHandler,
    }),
    [
      status,
      sendMessage,
      emitReceipt,
      emitWebRtcSignaling,
      getLastSeen,
      setPresenceHeartbeatMode,
      setWebRtcInboundHandler,
    ],
  );

  return (
    <SocketWorkerContext.Provider value={value}>
      <InboundNotificationListener />
      {children}
    </SocketWorkerContext.Provider>
  );
}
