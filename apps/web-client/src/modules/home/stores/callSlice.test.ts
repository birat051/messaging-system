import { describe, expect, it } from 'vitest';
import {
  callInitialState,
  callReducer,
  clearCallSessionEndReason,
  hangupCall,
  incomingCallRinging,
  rejectCall,
  startOutgoingCall,
} from './callSlice';

describe('callSlice — session end reason', () => {
  it('records remote when hangupCall({ reason: remote })', () => {
    const state = callReducer(
      {
        ...callInitialState,
        phase: 'active',
        callId: 'c1',
        peerUserId: 'p1',
        peerResolvedLabel: 'Jordan',
      },
      hangupCall({ reason: 'remote' }),
    );
    expect(state.phase).toBe('idle');
    expect(state.lastSessionEndReason).toBe('remote');
    expect(state.lastRemoteEndedPeerLabel).toBe('Jordan');
  });

  it('records local when hangupCall({ reason: local })', () => {
    const state = callReducer(
      {
        ...callInitialState,
        phase: 'active',
        callId: 'c1',
        peerUserId: 'p1',
      },
      hangupCall({ reason: 'local' }),
    );
    expect(state.lastSessionEndReason).toBe('local');
  });

  it('defaults hangupCall() to system', () => {
    const state = callReducer(
      {
        ...callInitialState,
        phase: 'active',
        callId: 'c1',
        peerUserId: 'p1',
      },
      hangupCall(),
    );
    expect(state.lastSessionEndReason).toBe('system');
  });

  it('rejectCall records local', () => {
    const state = callReducer(
      {
        ...callInitialState,
        phase: 'incoming_ring',
        callId: 'c1',
        peerUserId: 'p1',
        pendingRemoteSdp: 'v=0',
      },
      rejectCall(),
    );
    expect(state.lastSessionEndReason).toBe('local');
  });

  it('clears lastSessionEndReason when a new outgoing call starts', () => {
    let state = callReducer(
      {
        ...callInitialState,
        phase: 'idle',
        lastSessionEndReason: 'remote',
      },
      startOutgoingCall('peer-1'),
    );
    expect(state.lastSessionEndReason).toBeNull();
    expect(state.phase).toBe('outgoing_ring');

    state = callReducer(
      state,
      hangupCall({ reason: 'local' }),
    );
    expect(state.lastSessionEndReason).toBe('local');

    state = callReducer(
      state,
      incomingCallRinging({
        callId: 'ic',
        peerUserId: 'p2',
        remoteSdp: 'v=0',
      }),
    );
    expect(state.lastSessionEndReason).toBeNull();
  });

  it('startOutgoingCall with display + username sets peerResolvedLabel', () => {
    const state = callReducer(
      callInitialState,
      startOutgoingCall({
        peerUserId: 'peer-x',
        peerDisplayName: 'Display X',
        peerUsername: 'user_x',
      }),
    );
    expect(state.peerResolvedLabel).toBe('Display X');
  });

  it('startOutgoingCall with username only uses username', () => {
    const state = callReducer(
      callInitialState,
      startOutgoingCall({
        peerUserId: 'peer-x',
        peerDisplayName: null,
        peerUsername: 'only_handle',
      }),
    );
    expect(state.peerResolvedLabel).toBe('only_handle');
  });
});

describe('clearCallSessionEndReason', () => {
  it('clears lastSessionEndReason and lastRemoteEndedPeerLabel', () => {
    const state = callReducer(
      {
        ...callInitialState,
        phase: 'idle',
        lastSessionEndReason: 'remote',
        lastRemoteEndedPeerLabel: 'Sam',
      },
      clearCallSessionEndReason(),
    );
    expect(state.lastSessionEndReason).toBeNull();
    expect(state.lastRemoteEndedPeerLabel).toBeNull();
  });
});
