import { describe, expect, it } from 'vitest';
import { streamHasRenderableVideo } from './mediaStreamVideo';

function mockStream(tracks: Array<{ kind: string; readyState: string; enabled: boolean }>) {
  return {
    getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
  } as unknown as MediaStream;
}

describe('streamHasRenderableVideo', () => {
  it('returns false for null', () => {
    expect(streamHasRenderableVideo(null)).toBe(false);
  });

  it('returns false when no live enabled video', () => {
    expect(
      streamHasRenderableVideo(
        mockStream([
          { kind: 'video', readyState: 'ended', enabled: true },
        ]),
      ),
    ).toBe(false);
  });

  it('returns true when a live enabled video track exists', () => {
    expect(
      streamHasRenderableVideo(
        mockStream([
          { kind: 'video', readyState: 'live', enabled: true },
        ]),
      ),
    ).toBe(true);
  });
});
