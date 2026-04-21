import type { ParsedNotificationPayload } from '@/common/realtime/socketNotificationPayload';

/** Aligned with **`ParsedNotificationPayload.kind`** — one distinct sound each. */
export type InboundNotificationSoundKind = ParsedNotificationPayload['kind'];

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof globalThis === 'undefined') {
    return null;
  }
  const g = globalThis as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

function scheduleTone(
  ctx: AudioContext,
  startTime: number,
  frequencyHz: number,
  durationSec: number,
  peak = 0.1,
): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = frequencyHz;
  const end = startTime + durationSec;
  gain.gain.setValueAtTime(0.0001, startTime);
  gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(end + 0.02);
}

/** Short, quiet single tone for chat alerts — keep much softer than **`playCallIncomingRing`**. */
function playMessageAlert(ctx: AudioContext): void {
  scheduleTone(ctx, ctx.currentTime, 920, 0.08, 0.07);
}

/**
 * Loud multi-pulse “phone ring” for incoming calls — **longer** pulses and **~4× peak gain** vs **`playMessageAlert`**.
 */
function playCallIncomingRing(ctx: AudioContext): void {
  const t = ctx.currentTime;
  const peak = 0.28;
  const pulseSec = 0.24;
  const gapSec = 0.1;
  scheduleTone(ctx, t, 440, pulseSec, peak);
  scheduleTone(ctx, t + pulseSec + gapSec, 520, pulseSec, peak);
  scheduleTone(ctx, t + 2 * (pulseSec + gapSec), 440, pulseSec, peak * 0.92);
}

/**
 * Plays a **distinct** in-tab alert for **`notification`** **`kind`** (Web Audio — no asset files).
 * Safe to call off user gestures; **`resume()`** handles suspended contexts where supported.
 */
export function playInboundNotificationSound(
  kind: InboundNotificationSoundKind,
): void {
  const Ctor = getAudioContextConstructor();
  if (!Ctor) {
    return;
  }
  const ctx = new Ctor();
  void ctx.resume().catch(() => {
    /* ignore — autoplay policies */
  });
  if (kind === 'message') {
    playMessageAlert(ctx);
  } else {
    playCallIncomingRing(ctx);
  }
}
