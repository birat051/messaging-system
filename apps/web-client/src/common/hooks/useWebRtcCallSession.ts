import { useCallback, useEffect, useRef, useState } from 'react';
import { describeMediaAccessError } from '@/common/webrtc/callMediaErrors';
import { streamHasRenderableVideo } from '@/common/webrtc/mediaStreamVideo';
import { getWebRtcIceServers } from '@/common/utils/webrtcIceServers';
import { serializeIceCandidateForSignaling } from '@/common/webrtc/webrtcIceCandidateSerialize';
import type { WebRtcInboundMessage } from '@/common/realtime/socketBridge';
import { useSocketWorker } from '@/common/realtime/SocketWorkerProvider';
import type { WebRtcMediaRefs } from '@/common/hooks/webRtcMediaRefs';
import {
  hangupCall,
  peerAnsweredOutgoing,
  setCallError,
  type CallSessionEndReason,
} from '@/modules/home/stores/callSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

type Role = 'caller' | 'callee';

function flushIceBuffer(
  pc: RTCPeerConnection,
  buffer: RTCIceCandidateInit[],
): void {
  const copy = [...buffer];
  buffer.length = 0;
  for (const init of copy) {
    void pc.addIceCandidate(init).catch(() => {
      /* ignore stale ICE after teardown */
    });
  }
}

/**
 * Owns one **`RTCPeerConnection`** for the current **Redux** call session: **outbound offer**, **inbound answer**,
 * **ICE**, **`getUserMedia`**, and track muting from **`micMuted` / `cameraOff`**.
 * Routes remote audio through **`remoteVideoRef`** when there is video (avoids double audio), else **`remoteAudioRef`**.
 */
export function useWebRtcCallSession(
  activeConversationId: string | null,
  mediaRefs: WebRtcMediaRefs,
): {
  localVideoVisible: boolean;
  remoteVideoVisible: boolean;
  /** End this side of the call and notify the peer via **`webrtc:hangup`** when possible. */
  requestLocalEndCall: () => void;
  /** From **`callSlice`** — why the previous session ended (toast / UX). */
  lastSessionEndReason: CallSessionEndReason | null;
} {
  const dispatch = useAppDispatch();
  const socket = useSocketWorker();
  const {
    phase,
    callId,
    peerUserId,
    pendingRemoteSdp,
    micMuted,
    cameraOff,
    lastSessionEndReason,
  } = useAppSelector((s) => s.call);

  const [remoteVideoVisible, setRemoteVideoVisible] = useState(false);
  const [localVideoVisible, setLocalVideoVisible] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const roleRef = useRef<Role | null>(null);
  const iceBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const processedOutgoingCallIdRef = useRef<string | null>(null);
  const calleeNegotiatedCallIdRef = useRef<string | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  conversationIdRef.current = activeConversationId;
  const micMutedRef = useRef(micMuted);
  const cameraOffRef = useRef(cameraOff);
  micMutedRef.current = micMuted;
  cameraOffRef.current = cameraOff;

  const { remoteAudioRef, remoteVideoRef, localVideoRef } = mediaRefs;

  function attachRemoteStream(ms: MediaStream): void {
    remoteStreamRef.current = ms;
    const rv = remoteVideoRef.current;
    const ra = remoteAudioRef.current;
    const hasVid = streamHasRenderableVideo(ms);
    if (hasVid && rv) {
      rv.srcObject = ms;
      rv.muted = false;
      void rv.play().catch(() => {});
      if (ra) {
        ra.srcObject = null;
      }
    } else {
      if (rv) {
        rv.srcObject = null;
      }
      if (ra) {
        ra.srcObject = ms;
      }
    }
    setRemoteVideoVisible(hasVid);
    for (const t of ms.getVideoTracks()) {
      const sync = (): void => {
        setRemoteVideoVisible(streamHasRenderableVideo(ms));
      };
      t.addEventListener('ended', sync);
      t.addEventListener('mute', sync);
      t.addEventListener('unmute', sync);
    }
  }

  function attachLocalStream(stream: MediaStream): void {
    localStreamRef.current = stream;
    const lv = localVideoRef.current;
    if (lv) {
      lv.srcObject = stream;
      lv.muted = true;
      void lv.play().catch(() => {});
    }
    setLocalVideoVisible(streamHasRenderableVideo(stream));
  }

  const signalingConv = (): { conversationId: string } | Record<string, never> => {
    const c = conversationIdRef.current;
    return c ? { conversationId: c } : {};
  };

  useEffect(() => {
    if (!socket) {
      return;
    }
    const handler = (msg: WebRtcInboundMessage) => {
      if (msg.event === 'webrtc:offer') {
        return;
      }
      if (msg.event === 'webrtc:hangup') {
        const rawHangup = msg.payload;
        if (rawHangup === null || typeof rawHangup !== 'object') {
          return;
        }
        const hp = rawHangup as Record<string, unknown>;
        const fromUserId =
          typeof hp.fromUserId === 'string' ? hp.fromUserId : null;
        const remoteHangupCallId =
          typeof hp.callId === 'string' ? hp.callId : null;
        if (
          !fromUserId ||
          !remoteHangupCallId ||
          !callId ||
          remoteHangupCallId !== callId ||
          !peerUserId ||
          fromUserId !== peerUserId
        ) {
          return;
        }
        dispatch(hangupCall({ reason: 'remote' }));
        return;
      }
      const raw = msg.payload;
      if (raw === null || typeof raw !== 'object') {
        return;
      }
      const p = raw as Record<string, unknown>;
      const fromUserId =
        typeof p.fromUserId === 'string' ? p.fromUserId : null;
      const cid = typeof p.callId === 'string' ? p.callId : null;
      if (
        !fromUserId ||
        !cid ||
        !callId ||
        cid !== callId ||
        !peerUserId ||
        fromUserId !== peerUserId
      ) {
        return;
      }

      const pc = pcRef.current;
      if (!pc) {
        if (msg.event === 'webrtc:candidate') {
          const cand = p.candidate;
          if (cand && typeof cand === 'object') {
            iceBufferRef.current.push(cand as unknown as RTCIceCandidateInit);
          }
        }
        return;
      }

      if (msg.event === 'webrtc:answer') {
        void (async () => {
          const sdp = typeof p.sdp === 'string' ? p.sdp : '';
          if (!sdp || roleRef.current !== 'caller') {
            return;
          }
          try {
            await pc.setRemoteDescription({ type: 'answer', sdp });
            flushIceBuffer(pc, iceBufferRef.current);
            dispatch(peerAnsweredOutgoing());
          } catch (e: unknown) {
            dispatch(
              setCallError(
                e instanceof Error ? e.message : 'Failed to apply remote answer',
              ),
            );
            dispatch(hangupCall({ reason: 'system' }));
          }
        })();
        return;
      }

      if (msg.event === 'webrtc:candidate') {
        const cand = p.candidate;
        if (!cand || typeof cand !== 'object') {
          return;
        }
        const init = cand as unknown as RTCIceCandidateInit;
        if (!pc.remoteDescription) {
          iceBufferRef.current.push(init);
          return;
        }
        void pc.addIceCandidate(init).catch(() => {});
      }
    };

    if (typeof socket.setWebRtcInboundHandler === 'function') {
      socket.setWebRtcInboundHandler(handler);
      return () => {
        socket.setWebRtcInboundHandler(null);
      };
    }
    return undefined;
  }, [socket, dispatch, callId, peerUserId]);

  useEffect(() => {
    const s = localStreamRef.current;
    if (!s) {
      return;
    }
    const a = s.getAudioTracks()[0];
    if (a) {
      a.enabled = !micMuted;
    }
    const v = s.getVideoTracks()[0];
    if (v) {
      v.enabled = !cameraOff;
    }
    setLocalVideoVisible(streamHasRenderableVideo(s));
  }, [micMuted, cameraOff, phase]);

  useEffect(() => {
    if (phase !== 'idle') {
      return;
    }
    processedOutgoingCallIdRef.current = null;
    calleeNegotiatedCallIdRef.current = null;
    roleRef.current = null;
    iceBufferRef.current = [];
    remoteStreamRef.current = null;
    setRemoteVideoVisible(false);
    setLocalVideoVisible(false);
    const ra = remoteAudioRef.current;
    if (ra) {
      ra.srcObject = null;
    }
    const rv = remoteVideoRef.current;
    if (rv) {
      rv.srcObject = null;
    }
    const lv = localVideoRef.current;
    if (lv) {
      lv.srcObject = null;
    }
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    pcRef.current?.close();
    pcRef.current = null;
  }, [
    phase,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
  ]);

  useEffect(() => {
    if (phase !== 'outgoing_ring' || !callId || !peerUserId || !socket) {
      return;
    }
    if (typeof RTCPeerConnection === 'undefined') {
      dispatch(
        setCallError('WebRTC is not available in this browser or context.'),
      );
      dispatch(hangupCall({ reason: 'system' }));
      return;
    }
    if (processedOutgoingCallIdRef.current === callId) {
      return;
    }
    processedOutgoingCallIdRef.current = callId;
    roleRef.current = 'caller';

    let cancelled = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getAudioTracks()[0]!.enabled = !micMutedRef.current;
        const vt0 = stream.getVideoTracks()[0];
        if (vt0) {
          vt0.enabled = !cameraOffRef.current;
        }
        attachLocalStream(stream);

        const pc = new RTCPeerConnection({
          iceServers: getWebRtcIceServers(),
        });
        pcRef.current = pc;

        pc.ontrack = (ev) => {
          const ms = ev.streams[0] ?? null;
          if (ms) {
            attachRemoteStream(ms);
          }
        };

        pc.onicecandidate = (ev) => {
          if (!ev.candidate || !socket) {
            return;
          }
          void socket
            .emitWebRtcSignaling('webrtc:candidate', {
              toUserId: peerUserId,
              callId,
              candidate: serializeIceCandidateForSignaling(ev.candidate),
              ...signalingConv(),
            })
            .catch((e: unknown) => {
              dispatch(
                setCallError(
                  e instanceof Error ? e.message : 'Failed to send ICE candidate',
                ),
              );
            });
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') {
            dispatch(
              setCallError(
                'Call connection failed. You can hang up and try again.',
              ),
            );
          }
        };

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        const sdp = pc.localDescription?.sdp;
        if (!sdp) {
          throw new Error('Missing local SDP');
        }

        await socket.emitWebRtcSignaling('webrtc:offer', {
          toUserId: peerUserId,
          callId,
          sdp,
          ...signalingConv(),
        });
      } catch (e: unknown) {
        if (!cancelled) {
          dispatch(setCallError(describeMediaAccessError(e)));
          dispatch(hangupCall({ reason: 'system' }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [phase, callId, peerUserId, socket, dispatch, remoteAudioRef, remoteVideoRef, localVideoRef]);

  useEffect(() => {
    if (phase !== 'active' || !pendingRemoteSdp || !callId || !peerUserId) {
      return;
    }
    if (roleRef.current === 'caller') {
      return;
    }
    if (calleeNegotiatedCallIdRef.current === callId) {
      return;
    }
    if (pcRef.current) {
      return;
    }
    if (typeof RTCPeerConnection === 'undefined' || !socket) {
      return;
    }

    calleeNegotiatedCallIdRef.current = callId;
    roleRef.current = 'callee';
    let cancelled = false;

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.getAudioTracks()[0]!.enabled = !micMutedRef.current;
        const vt1 = stream.getVideoTracks()[0];
        if (vt1) {
          vt1.enabled = !cameraOffRef.current;
        }
        attachLocalStream(stream);

        const pc = new RTCPeerConnection({
          iceServers: getWebRtcIceServers(),
        });
        pcRef.current = pc;

        pc.ontrack = (ev) => {
          const ms = ev.streams[0] ?? null;
          if (ms) {
            attachRemoteStream(ms);
          }
        };

        pc.onicecandidate = (ev) => {
          if (!ev.candidate || !socket) {
            return;
          }
          void socket
            .emitWebRtcSignaling('webrtc:candidate', {
              toUserId: peerUserId,
              callId,
              candidate: serializeIceCandidateForSignaling(ev.candidate),
              ...signalingConv(),
            })
            .catch((e: unknown) => {
              dispatch(
                setCallError(
                  e instanceof Error ? e.message : 'Failed to send ICE candidate',
                ),
              );
            });
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed') {
            dispatch(
              setCallError(
                'Call connection failed. You can hang up and try again.',
              ),
            );
          }
        };

        await pc.setRemoteDescription({
          type: 'offer',
          sdp: pendingRemoteSdp,
        });
        flushIceBuffer(pc, iceBufferRef.current);

        stream.getTracks().forEach((t) => pc.addTrack(t, stream));

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const sdp = pc.localDescription?.sdp;
        if (!sdp) {
          throw new Error('Missing local answer SDP');
        }

        await socket.emitWebRtcSignaling('webrtc:answer', {
          toUserId: peerUserId,
          callId,
          sdp,
          ...signalingConv(),
        });
      } catch (e: unknown) {
        if (!cancelled) {
          dispatch(setCallError(describeMediaAccessError(e)));
          dispatch(hangupCall({ reason: 'system' }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    phase,
    pendingRemoteSdp,
    callId,
    peerUserId,
    socket,
    dispatch,
    remoteAudioRef,
    remoteVideoRef,
    localVideoRef,
  ]);

  const requestLocalEndCall = useCallback(() => {
    dispatch(setCallError(null));
    const ph = phase;
    const pid = peerUserId;
    const cid = callId;
    if (ph === 'idle') {
      return;
    }
    if (!pid || !cid) {
      dispatch(hangupCall({ reason: 'system' }));
      return;
    }
    const payload: { toUserId: string; callId: string; conversationId?: string } =
      {
        toUserId: pid,
        callId: cid,
      };
    const conv = conversationIdRef.current;
    if (conv) {
      payload.conversationId = conv;
    }
    if (!socket) {
      dispatch(hangupCall({ reason: 'system' }));
      return;
    }
    void socket.emitWebRtcSignaling('webrtc:hangup', payload).finally(() => {
      dispatch(hangupCall({ reason: 'local' }));
    });
  }, [socket, dispatch, phase, peerUserId, callId]);

  return {
    localVideoVisible,
    remoteVideoVisible,
    requestLocalEndCall,
    lastSessionEndReason,
  };
}
