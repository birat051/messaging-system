import { useEffect, useMemo, useRef, useState } from 'react';
import {
  answerCall,
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

type CallChrome = 'fullscreen' | 'minimized';

/**
 * Redux-backed 1:1 call UI: **full viewport** while expanded, **Minimize** → floating bar; **Expand** restores.
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

  const [callChrome, setCallChrome] = useState<CallChrome>('fullscreen');
  const prevPhase = useRef<typeof phase | null>(null);

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

  const { localVideoVisible, remoteVideoVisible, requestLocalEndCall } =
    useWebRtcCallSession(activeConversationId, mediaRefs);

  useEffect(() => {
    if (prevPhase.current === 'idle' && phase !== 'idle') {
      setCallChrome('fullscreen');
    }
    prevPhase.current = phase;
  }, [phase]);

  useEffect(() => {
    if (phase === 'idle') {
      return;
    }
    if (isGroupThread) {
      requestLocalEndCall();
      return;
    }
    if (peerUserId == null) {
      return;
    }
    if (activeConversationId == null) {
      if (phase === 'outgoing_ring' || phase === 'active') {
        requestLocalEndCall();
      }
      return;
    }
    if (
      (phase === 'outgoing_ring' || phase === 'active') &&
      selectedPeerUserId != null &&
      selectedPeerUserId !== peerUserId
    ) {
      requestLocalEndCall();
    }
  }, [
    phase,
    peerUserId,
    activeConversationId,
    isGroupThread,
    selectedPeerUserId,
    requestLocalEndCall,
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

  const videoStageProps = {
    phase,
    remotePeerLabel: remoteLabel,
    remoteVideoRef,
    localVideoRef,
    remoteHasVideo: remoteVideoVisible,
    localHasVideo: localVideoVisible,
    cameraOff,
  };

  const controls = (
    <CallControls
      phase={phase}
      micMuted={micMuted}
      cameraOff={cameraOff}
      answerDisabled={
        phase === 'incoming_ring' &&
        (!pendingRemoteSdp || pendingRemoteSdp.length === 0)
      }
      onAnswer={() => dispatch(answerCall())}
      onReject={requestLocalEndCall}
      onToggleMute={() => dispatch(toggleCallMic())}
      onToggleVideo={() => dispatch(toggleCallVideo())}
      onHangup={requestLocalEndCall}
    />
  );

  const errorBlock =
    errorMessage ? (
      <p
        role="alert"
        className="text-foreground text-sm opacity-90"
        data-testid="call-session-error"
      >
        {errorMessage}
      </p>
    ) : null;

  const btnBar =
    'focus:ring-accent/50 min-h-11 shrink-0 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground outline-none transition-colors hover:bg-surface/80 focus:ring-2 disabled:pointer-events-none disabled:opacity-50';

  return (
    <div
      role="region"
      aria-label={statusLabel}
      data-testid="call-session-dock"
      data-call-chrome={callChrome}
      className={
        callChrome === 'fullscreen'
          ? 'bg-background/98 supports-[backdrop-filter]:bg-background/95 fixed inset-0 z-50 flex flex-col backdrop-blur-md dark:bg-background/95'
          : 'border-border bg-surface/98 supports-[backdrop-filter]:bg-surface/95 fixed bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-3 right-3 z-50 max-h-[min(85vh,340px)] overflow-y-auto rounded-2xl border shadow-[0_8px_40px_rgba(0,0,0,0.18)] backdrop-blur-md sm:left-auto sm:right-4 sm:max-h-none sm:w-full sm:max-w-[min(100%,28rem)] dark:shadow-[0_8px_40px_rgba(0,0,0,0.45)]'
      }
    >
      {callChrome === 'fullscreen' ? (
        <>
          <div className="border-border flex shrink-0 items-start justify-between gap-3 border-b px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pt-[max(0.5rem,env(safe-area-inset-top))]">
            <div className="min-w-0 flex-1 space-y-1">
              <p
                className="text-foreground text-sm font-semibold sm:text-base"
                aria-live="polite"
                aria-atomic="true"
              >
                {statusLabel}
              </p>
              {errorBlock}
            </div>
            <button
              type="button"
              className={btnBar}
              onClick={() => setCallChrome('minimized')}
              aria-label="Minimize call"
              data-testid="call-minimize"
            >
              Minimize
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] sm:px-6 sm:py-4">
              <CallVideoStage {...videoStageProps} layout="default" />
            </div>

            <div
              className="border-border flex shrink-0 flex-col gap-3 border-t px-[max(1rem,env(safe-area-inset-left))] py-3 pr-[max(1rem,env(safe-area-inset-right))] pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:items-end sm:justify-end"
              data-testid="call-session-dock-controls"
            >
              {controls}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
          <CallVideoStage {...videoStageProps} layout="compact" />

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
            <p
              className="text-foreground text-sm font-semibold sm:text-base"
              aria-live="polite"
            >
              {statusLabel}
            </p>
            {errorBlock}
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <button
                type="button"
                className={btnBar}
                onClick={() => setCallChrome('fullscreen')}
                aria-label="Expand call to full screen"
                data-testid="call-expand"
              >
                Expand
              </button>
              <div className="min-w-0 flex-1 sm:flex-initial">{controls}</div>
            </div>
          </div>
        </div>
      )}

      <audio
        ref={remoteAudioRef}
        className="pointer-events-none sr-only"
        aria-hidden={true}
        autoPlay
        playsInline
      />
    </div>
  );
}
