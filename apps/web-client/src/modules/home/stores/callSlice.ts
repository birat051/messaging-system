import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { formatPeerCallEndLabel } from '@/modules/home/utils/peerCallEndLabel';

export type CallPhase = 'idle' | 'incoming_ring' | 'outgoing_ring' | 'active';

/**
 * Why the last call session ended — for UX (e.g. peer hung up vs you ended the call).
 * Cleared when a new **`startOutgoingCall`** / **`incomingCallRinging`** begins.
 */
export type CallSessionEndReason = 'local' | 'remote' | 'system';

export type CallState = {
  phase: CallPhase;
  callId: string | null;
  peerUserId: string | null;
  /** Latest inbound **SDP offer** text (**`webrtc:offer`**) until answered or cleared. */
  pendingRemoteSdp: string | null;
  micMuted: boolean;
  cameraOff: boolean;
  /** User-visible error (media, signaling); cleared on hangup / reject. */
  errorMessage: string | null;
  /**
   * Set when the session leaves **non-idle** — **`local`** (user hangup / reject / navigate away),
   * **`remote`** (inbound **`webrtc:hangup`**), **`system`** (errors, missing socket, WebRTC unavailable).
   */
  lastSessionEndReason: CallSessionEndReason | null;
  /**
   * Resolved peer label for this session (**display name** → **username** → id hint) — cleared when the session ends.
   */
  peerResolvedLabel: string | null;
  /** After a **remote** hangup — copy for **`RemoteCallEndedToast`** until cleared with **`lastSessionEndReason`**. */
  lastRemoteEndedPeerLabel: string | null;
};

export const callInitialState: CallState = {
  phase: 'idle',
  callId: null,
  peerUserId: null,
  pendingRemoteSdp: null,
  micMuted: false,
  cameraOff: false,
  errorMessage: null,
  lastSessionEndReason: null,
  peerResolvedLabel: null,
  lastRemoteEndedPeerLabel: null,
};

function clearSession(state: CallState, endReason: CallSessionEndReason): void {
  const pid = state.peerUserId;
  const resolved = state.peerResolvedLabel?.trim();
  const endLabel =
    resolved ||
    (pid
      ? formatPeerCallEndLabel({ userId: pid })
      : '');

  state.phase = 'idle';
  state.callId = null;
  state.peerUserId = null;
  state.pendingRemoteSdp = null;
  state.micMuted = false;
  state.cameraOff = false;
  state.errorMessage = null;
  state.peerResolvedLabel = null;
  state.lastSessionEndReason = endReason;
  state.lastRemoteEndedPeerLabel =
    endReason === 'remote' && endLabel.length > 0 ? endLabel : null;
}

function resetSessionStart(state: CallState): void {
  state.lastSessionEndReason = null;
  state.lastRemoteEndedPeerLabel = null;
}

const callSlice = createSlice({
  name: 'call',
  initialState: callInitialState,
  reducers: {
    startOutgoingCall: {
      reducer(
        state,
        action: PayloadAction<{
          callId: string;
          peerUserId: string;
          peerResolvedLabel: string;
        }>,
      ) {
        resetSessionStart(state);
        state.phase = 'outgoing_ring';
        state.callId = action.payload.callId;
        state.peerUserId = action.payload.peerUserId;
        state.peerResolvedLabel = action.payload.peerResolvedLabel;
        state.micMuted = false;
        state.cameraOff = false;
        state.pendingRemoteSdp = null;
        state.errorMessage = null;
      },
      prepare(
        input:
          | string
          | {
              peerUserId: string;
              peerDisplayName?: string | null;
              peerUsername?: string | null;
            },
      ) {
        if (typeof input === 'string') {
          const peerUserId = input.trim();
          return {
            payload: {
              callId: globalThis.crypto.randomUUID(),
              peerUserId,
              peerResolvedLabel: formatPeerCallEndLabel({ userId: peerUserId }),
            },
          };
        }
        const peerUserId = input.peerUserId.trim();
        return {
          payload: {
            callId: globalThis.crypto.randomUUID(),
            peerUserId,
            peerResolvedLabel: formatPeerCallEndLabel({
              userId: peerUserId,
              displayName: input.peerDisplayName,
              username: input.peerUsername,
            }),
          },
        };
      },
    },
    incomingCallRinging(
      state,
      action: PayloadAction<{
        callId: string;
        peerUserId: string;
        remoteSdp: string;
        peerDisplayName?: string | null;
        peerUsername?: string | null;
      }>,
    ) {
      resetSessionStart(state);
      state.phase = 'incoming_ring';
      state.callId = action.payload.callId;
      state.peerUserId = action.payload.peerUserId;
      state.pendingRemoteSdp = action.payload.remoteSdp;
      state.peerResolvedLabel = formatPeerCallEndLabel({
        userId: action.payload.peerUserId,
        displayName: action.payload.peerDisplayName,
        username: action.payload.peerUsername,
      });
      state.micMuted = false;
      state.cameraOff = false;
      state.errorMessage = null;
    },
    answerCall(state) {
      if (state.phase === 'incoming_ring') {
        state.phase = 'active';
      }
    },
    peerAnsweredOutgoing(state) {
      if (state.phase === 'outgoing_ring') {
        state.phase = 'active';
      }
    },
    setCallError(state, action: PayloadAction<string | null>) {
      state.errorMessage = action.payload;
    },
    rejectCall(state) {
      clearSession(state, 'local');
    },
    hangupCall(
      state,
      action: PayloadAction<{ reason: CallSessionEndReason } | undefined>,
    ) {
      clearSession(state, action.payload?.reason ?? 'system');
    },
    toggleCallMic(state) {
      if (state.phase === 'active') {
        state.micMuted = !state.micMuted;
      }
    },
    toggleCallVideo(state) {
      if (state.phase === 'active') {
        state.cameraOff = !state.cameraOff;
      }
    },
    /** Clears **`lastSessionEndReason`** after remote-end toast auto-dismiss (or manual dismiss). */
    clearCallSessionEndReason(state) {
      state.lastSessionEndReason = null;
      state.lastRemoteEndedPeerLabel = null;
    },
  },
});

export const {
  startOutgoingCall,
  incomingCallRinging,
  answerCall,
  peerAnsweredOutgoing,
  setCallError,
  rejectCall,
  hangupCall,
  toggleCallMic,
  toggleCallVideo,
  clearCallSessionEndReason,
} = callSlice.actions;

export const { reducer: callReducer } = callSlice;
