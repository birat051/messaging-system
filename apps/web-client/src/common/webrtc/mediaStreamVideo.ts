/**
 * Whether a **`MediaStream`** has a **live, enabled** video track (suitable for showing **`HTMLVideoElement`**).
 */
export function streamHasRenderableVideo(stream: MediaStream | null): boolean {
  if (!stream) {
    return false;
  }
  return stream
    .getVideoTracks()
    .some(
      (t) =>
        t.kind === 'video' &&
        t.readyState === 'live' &&
        t.enabled,
    );
}
