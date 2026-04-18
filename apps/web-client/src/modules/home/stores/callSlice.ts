import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export type CallPhase = 'idle' | 'incoming_ring' | 'outgoing_ring' | 'active';

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
};

export const callInitialState: CallState = {
  phase: 'idle',
  callId: null,
  peerUserId: null,
  pendingRemoteSdp: null,
  micMuted: false,
  cameraOff: false,
  errorMessage: null,
};

function clearSession(state: CallState): void {
  state.phase = 'idle';
  state.callId = null;
  state.peerUserId = null;
  state.pendingRemoteSdp = null;
  state.micMuted = false;
  state.cameraOff = false;
  state.errorMessage = null;
}

const callSlice = createSlice({
  name: 'call',
  initialState: callInitialState,
  reducers: {
    startOutgoingCall: {
      reducer(
        state,
        action: PayloadAction<{ callId: string; peerUserId: string }>,
      ) {
        state.phase = 'outgoing_ring';
        state.callId = action.payload.callId;
        state.peerUserId = action.payload.peerUserId;
        state.micMuted = false;
        state.cameraOff = false;
        state.pendingRemoteSdp = null;
        state.errorMessage = null;
      },
      prepare(peerUserId: string) {
        return {
          payload: {
            callId: globalThis.crypto.randomUUID(),
            peerUserId,
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
      }>,
    ) {
      state.phase = 'incoming_ring';
      state.callId = action.payload.callId;
      state.peerUserId = action.payload.peerUserId;
      state.pendingRemoteSdp = action.payload.remoteSdp;
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
    rejectCall: clearSession,
    hangupCall: clearSession,
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
} = callSlice.actions;

export const { reducer: callReducer } = callSlice;
