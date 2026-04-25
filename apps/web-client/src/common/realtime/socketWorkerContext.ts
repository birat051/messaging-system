import { createContext } from 'react';
import type {
  PresenceConnectionStatus,
  PresenceLastSeenResult,
  WebRtcInboundMessage,
} from './socketBridge';
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
  emitWebRtcSignaling: (
    event:
      | 'webrtc:offer'
      | 'webrtc:answer'
      | 'webrtc:candidate'
      | 'webrtc:hangup',
    payload: unknown,
  ) => Promise<void>;
  /** Resolve last-seen for **`targetUserId`** via **`presence:getLastSeen`** ack (Feature 6). */
  getLastSeen: (targetUserId: string) => Promise<PresenceLastSeenResult>;
  /**
   * **`active_thread`** uses a compact heartbeat interval (server-throttle-safe); **`default`** is the relaxed cadence.
   */
  setPresenceHeartbeatMode: (mode: 'default' | 'active_thread') => void;
  /** Register handler for inbound WebRTC signaling (answer / ICE after initial offer routing). */
  setWebRtcInboundHandler: (
    handler: ((msg: WebRtcInboundMessage) => void) | null,
  ) => void;
};

export const SocketWorkerContext = createContext<SocketWorkerContextValue | null>(
  null,
);
