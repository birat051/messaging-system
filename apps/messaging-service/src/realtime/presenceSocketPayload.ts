/**
 * Client → server: `socket.emit('presence:getLastSeen', { targetUserId: string }, ack)`
 */
export function parseGetLastSeenPayload(raw: unknown): string | undefined {
  if (raw === null || typeof raw !== 'object') {
    return undefined;
  }
  const id = (raw as { targetUserId?: unknown }).targetUserId;
  if (typeof id !== 'string') {
    return undefined;
  }
  const t = id.trim();
  return t.length > 0 ? t : undefined;
}
