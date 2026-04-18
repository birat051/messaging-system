import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { playInboundNotificationSound } from './notificationAlertSounds';

function createMockAudioContext(): AudioContext {
  const createOscillator = vi.fn(() => ({
    type: 'sine' as OscillatorType,
    frequency: { value: 440 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  }));
  const createGain = vi.fn(() => ({
    gain: {
      setValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    },
    connect: vi.fn(),
  }));
  return {
    state: 'running',
    currentTime: 5,
    destination: {} as AudioDestinationNode,
    resume: vi.fn(() => Promise.resolve()),
    createOscillator,
    createGain,
  } as unknown as AudioContext;
}

describe('notificationAlertSounds — playInboundNotificationSound', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no-ops when AudioContext constructor is unavailable', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    expect(() => playInboundNotificationSound('message')).not.toThrow();
  });

  it('kind message: one oscillator tone', () => {
    const mockCtx = createMockAudioContext();
    const Ctor = vi.fn(() => mockCtx);
    vi.stubGlobal('AudioContext', Ctor);

    playInboundNotificationSound('message');

    expect(Ctor).toHaveBeenCalledTimes(1);
    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(1);
    const osc = (
      mockCtx.createOscillator as ReturnType<typeof vi.fn>
    ).mock.results[0].value as { start: ReturnType<typeof vi.fn> };
    expect(osc.start).toHaveBeenCalled();
  });

  it('kind call_incoming: two-ring pattern (two oscillators)', () => {
    const mockCtx = createMockAudioContext();
    vi.stubGlobal('AudioContext', vi.fn(() => mockCtx));

    playInboundNotificationSound('call_incoming');

    expect(mockCtx.createOscillator).toHaveBeenCalledTimes(2);
  });
});
