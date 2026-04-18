import type { CallPhase } from '@/modules/home/stores/callSlice';

export type CallControlsProps = {
  phase: Exclude<CallPhase, 'idle'>;
  micMuted: boolean;
  cameraOff: boolean;
  disabled?: boolean;
  /** When true, **Answer** is disabled (e.g. remote SDP not ready yet). */
  answerDisabled?: boolean;
  onAnswer: () => void;
  onReject: () => void;
  onToggleMute: () => void;
  onToggleVideo: () => void;
  onHangup: () => void;
};

/**
 * 1:1 **call** toolbar (**`role="toolbar"`**) — **answer** / **decline** (incoming), **cancel** (**outgoing**), **mute** / **camera** / **hangup** (**active**).
 * When **`phase === 'idle'`**, render nothing from the parent (this type excludes **`idle`**).
 */
export function CallControls({
  phase,
  micMuted,
  cameraOff,
  disabled = false,
  answerDisabled = false,
  onAnswer,
  onReject,
  onToggleMute,
  onToggleVideo,
  onHangup,
}: CallControlsProps) {
  const btnBase =
    'focus:ring-accent/50 min-h-11 shrink-0 rounded-md px-4 text-sm font-medium outline-none transition-colors focus:ring-2 disabled:pointer-events-none disabled:opacity-50';
  const secondary = `${btnBase} border-border bg-surface text-foreground hover:bg-surface/80 border`;

  return (
    <div
      role="toolbar"
      aria-orientation="horizontal"
      aria-label="Call controls"
      className="flex flex-wrap items-center justify-center gap-2 sm:justify-end"
      data-testid="call-controls"
      data-phase={phase}
    >
      {phase === 'incoming_ring' ? (
        <>
          <button
            type="button"
            data-testid="call-control-answer"
            className={`${btnBase} bg-accent text-accent-foreground hover:opacity-95`}
            disabled={disabled || answerDisabled}
            onClick={onAnswer}
            aria-label="Answer call"
          >
            Answer
          </button>
          <button
            type="button"
            data-testid="call-control-reject"
            className={secondary}
            disabled={disabled}
            onClick={onReject}
            aria-label="Decline call"
          >
            Decline
          </button>
        </>
      ) : null}

      {phase === 'outgoing_ring' ? (
        <button
          type="button"
          data-testid="call-control-hangup"
          className={secondary}
          disabled={disabled}
          onClick={onHangup}
          aria-label="Cancel outgoing call"
        >
          Cancel call
        </button>
      ) : null}

      {phase === 'active' ? (
        <>
          <button
            type="button"
            data-testid="call-control-mute"
            aria-pressed={micMuted}
            aria-label={micMuted ? 'Unmute microphone' : 'Mute microphone'}
            className={secondary}
            disabled={disabled}
            onClick={onToggleMute}
          >
            {micMuted ? 'Unmute' : 'Mute'}
          </button>
          <button
            type="button"
            data-testid="call-control-video"
            aria-pressed={cameraOff}
            aria-label={
              cameraOff ? 'Turn camera on' : 'Turn camera off'
            }
            className={secondary}
            disabled={disabled}
            onClick={onToggleVideo}
          >
            {cameraOff ? 'Camera on' : 'Camera off'}
          </button>
          <button
            type="button"
            data-testid="call-control-hangup"
            className={`${btnBase} border border-red-600/80 text-red-700 hover:bg-red-600/10 dark:border-red-500/80 dark:text-red-300`}
            disabled={disabled}
            onClick={onHangup}
            aria-label="Hang up"
          >
            Hang up
          </button>
        </>
      ) : null}
    </div>
  );
}
