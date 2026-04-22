/**
 * Minimum ms between successful Redis **`setLastSeen`** writes for one Socket.IO connection.
 * The web worker emits **`presence:heartbeat`** every **5s**; **4500ms** keeps one write per tick with small clock drift.
 */
export const PRESENCE_HEARTBEAT_REDIS_WRITE_MIN_INTERVAL_MS = 4500;

/**
 * @param lastSuccessfulWriteMs `Date.now()` captured after the previous Redis write, or **0** before the first write on this socket.
 */
export function presenceHeartbeatAllowsRedisWrite(
  lastSuccessfulWriteMs: number,
  nowMs: number,
): boolean {
  if (lastSuccessfulWriteMs === 0) {
    return true;
  }
  return (
    nowMs - lastSuccessfulWriteMs >=
    PRESENCE_HEARTBEAT_REDIS_WRITE_MIN_INTERVAL_MS
  );
}
