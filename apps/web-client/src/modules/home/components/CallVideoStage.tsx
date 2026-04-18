import type { RefObject } from 'react';
import type { CallPhase } from '@/modules/home/stores/callSlice';

export type CallVideoStageProps = {
  phase: Exclude<CallPhase, 'idle'>;
  /** Label for remote participant (e.g. thread title). */
  remotePeerLabel: string;
  remoteVideoRef: RefObject<HTMLVideoElement>;
  localVideoRef: RefObject<HTMLVideoElement>;
  /** Remote stream has a live video track (not audio-only). */
  remoteHasVideo: boolean;
  /** Local stream has a live enabled video track. */
  localHasVideo: boolean;
  /** Redux: user turned camera off (local UI even if track exists). */
  cameraOff: boolean;
};

/**
 * **1:1** call video: large **remote** preview + **PiP** local preview, with placeholders when video is unavailable.
 */
export function CallVideoStage({
  phase,
  remotePeerLabel,
  remoteVideoRef,
  localVideoRef,
  remoteHasVideo,
  localHasVideo,
  cameraOff,
}: CallVideoStageProps) {
  const remoteLabel =
    remotePeerLabel.trim() || 'Remote participant';
  const showLocalPip = phase === 'active' || phase === 'outgoing_ring';

  return (
    <div
      className="border-border bg-background/85 supports-[backdrop-filter]:bg-background/75 pointer-events-auto relative w-full max-w-4xl flex-col gap-2 rounded-xl border px-2 pb-2 pt-2 shadow-lg backdrop-blur-md sm:px-3 sm:pb-3 sm:pt-3"
      data-testid="call-video-stage"
    >
      <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black/20 md:aspect-[21/9] md:max-h-[min(50vh,420px)]">
        <video
          ref={remoteVideoRef}
          className="size-full object-cover"
          playsInline
          autoPlay
          data-testid="call-video-remote"
          aria-label={`${remoteLabel} video`}
        />
        {!remoteHasVideo ? (
          <div
            className="bg-muted/80 text-muted-foreground absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm"
            aria-hidden={true}
          >
            <span className="text-foreground max-w-[18rem] font-medium">
              {remoteLabel}
            </span>
            <span className="text-xs">
              {phase === 'outgoing_ring' || phase === 'incoming_ring'
                ? 'Connecting…'
                : 'Camera off or audio only'}
            </span>
          </div>
        ) : null}
      </div>

      {showLocalPip ? (
        <div className="flex justify-end">
          <div className="border-border bg-muted/40 relative aspect-video w-[min(42vw,220px)] max-w-[260px] overflow-hidden rounded-lg border shadow-md sm:w-[min(32vw,200px)]">
            <video
              ref={localVideoRef}
              className="size-full object-cover"
              playsInline
              autoPlay
              muted
              data-testid="call-video-local"
              aria-label="Your video"
            />
            {cameraOff || !localHasVideo ? (
              <div
                className="bg-muted/85 text-muted-foreground absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 px-2 text-center text-xs"
                aria-hidden={true}
              >
                <span className="text-foreground font-medium">You</span>
                <span>
                  {cameraOff ? 'Camera off' : 'No camera'}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
