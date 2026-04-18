import { useEffect, useMemo, useRef } from 'react';
import {
  answerCall,
  hangupCall,
  rejectCall,
  setCallError,
  toggleCallMic,
  toggleCallVideo,
} from '@/modules/home/stores/callSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { useWebRtcCallSession } from '@/common/hooks/useWebRtcCallSession';
import { CallVideoStage } from './CallVideoStage';
import { CallControls } from './CallControls';

export type CallSessionDockProps = {
  activeConversationId: string | null;
  /** When true, any active call is ended (group threads do not support this client’s 1:1 call bar). */
  isGroupThread: boolean;
  /** Current DM peer for the open thread — used to end the call if the user switches threads. */
  selectedPeerUserId: string | null;
  /** Shown in the call bar (e.g. conversation title). */
  peerDisplayName: string | null;
};

/**
 * Redux-backed call UI: **remote/local video**, hidden **remote audio** when audio-only, **WebRTC** session hook, and **toolbar** controls.
 */
export function CallSessionDock({
  activeConversationId,
  isGroupThread,
  selectedPeerUserId,
  peerDisplayName,
}: CallSessionDockProps) {
  const dispatch = useAppDispatch();
  const { phase, micMuted, cameraOff, peerUserId, errorMessage, pendingRemoteSdp } =
    useAppSelector((s) => s.call);

  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);

  const mediaRefs = useMemo(
    () => ({
      remoteAudioRef,
      remoteVideoRef,
      localVideoRef,
    }),
    [],
  );

  const { localVideoVisible, remoteVideoVisible } = useWebRtcCallSession(
    activeConversationId,
    mediaRefs,
  );

  useEffect(() => {
    if (phase === 'idle') {
      return;
    }
    if (isGroupThread) {
      dispatch(hangupCall());
      return;
    }
    if (peerUserId == null) {
      return;
    }
    if (activeConversationId == null) {
      if (phase === 'outgoing_ring' || phase === 'active') {
        dispatch(hangupCall());
      }
      return;
    }
    if (
      (phase === 'outgoing_ring' || phase === 'active') &&
      selectedPeerUserId != null &&
      selectedPeerUserId !== peerUserId
    ) {
      dispatch(hangupCall());
    }
  }, [
    dispatch,
    phase,
    peerUserId,
    activeConversationId,
    isGroupThread,
    selectedPeerUserId,
  ]);

  if (phase === 'idle') {
    return null;
  }

  const peerBit =
    peerDisplayName?.trim() && peerDisplayName.trim().length > 0
      ? ` — ${peerDisplayName.trim()}`
      : '';

  const statusLabel =
    phase === 'incoming_ring'
      ? `Incoming call${peerBit}`
      : phase === 'outgoing_ring'
        ? `Calling…${peerBit}`
        : `In call${peerBit}`;

  const remoteLabel = peerDisplayName?.trim() || 'Remote participant';

  return (
    <div
      role="region"
      aria-label={statusLabel}
      data-testid="call-session-dock"
      className="border-border bg-surface/95 supports-[backdrop-filter]:bg-surface/90 fixed inset-x-0 bottom-0 z-50 flex max-h-[min(92vh,920px)] flex-col border-t shadow-[0_-4px_24px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:shadow-[0_-4px_24px_rgba(0,0,0,0.35)]"
    >
      <div className="pointer-events-auto max-h-[min(58vh,520px)] min-h-0 shrink-0 overflow-y-auto px-[max(1rem,env(safe-area-inset-left))] pt-3 pr-[max(1rem,env(safe-area-inset-right))]">
        <CallVideoStage
          phase={phase}
          remotePeerLabel={remoteLabel}
          remoteVideoRef={remoteVideoRef}
          localVideoRef={localVideoRef}
          remoteHasVideo={remoteVideoVisible}
          localHasVideo={localVideoVisible}
          cameraOff={cameraOff}
        />
      </div>

      <audio
        ref={remoteAudioRef}
        className="pointer-events-none sr-only"
        aria-hidden={true}
        autoPlay
        playsInline
      />

      <div
        className="border-border flex shrink-0 flex-col gap-3 border-t px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:justify-between"
        data-testid="call-session-dock-controls"
      >
        <div className="min-w-0 flex-1 space-y-2 text-center sm:text-left">
          <p
            className="text-foreground text-sm font-medium"
            aria-live="polite"
            aria-atomic="true"
          >
            {statusLabel}
          </p>
          {errorMessage ? (
            <p
              role="alert"
              className="text-foreground text-sm opacity-90"
              data-testid="call-session-error"
            >
              {errorMessage}
            </p>
          ) : null}
        </div>
        <CallControls
          phase={phase}
          micMuted={micMuted}
          cameraOff={cameraOff}
          answerDisabled={
            phase === 'incoming_ring' &&
            (!pendingRemoteSdp || pendingRemoteSdp.length === 0)
          }
          onAnswer={() => dispatch(answerCall())}
          onReject={() => {
            dispatch(setCallError(null));
            dispatch(rejectCall());
          }}
          onToggleMute={() => dispatch(toggleCallMic())}
          onToggleVideo={() => dispatch(toggleCallVideo())}
          onHangup={() => {
            dispatch(setCallError(null));
            dispatch(hangupCall());
          }}
        />
      </div>
    </div>
  );
}
