/**
 * Human-readable copy for **`getUserMedia`** / **`NotAllowedError`** style failures.
 */
export function describeMediaAccessError(err: unknown): string {
  const name =
    err !== null && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name)
      : '';

  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Microphone or camera access was blocked. Allow media permissions for this site in your browser settings and try again.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No microphone or camera was found. Connect a device and try again.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Your microphone or camera is in use by another application. Close it and try again.';
  }
  if (name === 'OverconstrainedError') {
    return 'The selected devices do not satisfy the call constraints.';
  }
  if (name === 'SecurityError') {
    return 'Media requires a secure context (HTTPS) except on localhost.';
  }

  return err instanceof Error && err.message.trim()
    ? err.message
    : 'Could not access microphone or camera.';
}
