/**
 * Parsed success payload for **`presence:getLastSeen`** Socket.IO ack (Feature 6 — aligns with **`LastSeenSocketResult`** on messaging-service).
 */
export type PresenceLastSeenResult =
  | { status: 'ok'; source: 'redis' | 'mongodb'; lastSeenAt: string }
  | { status: 'not_available' };

/**
 * Maps **`presence:getLastSeen`** server ack to resolve/reject for **`getLastSeen`** on the worker bridge.
 */
export function parsePresenceGetLastSeenAck(
  ack: unknown,
): { ok: true; value: PresenceLastSeenResult } | { ok: false; error: Error } {
  if (ack !== null && typeof ack === 'object' && 'status' in ack) {
    const status = (ack as { status: unknown }).status;
    if (status === 'ok') {
      const a = ack as { source?: unknown; lastSeenAt?: unknown };
      const src = a.source;
      const source = src === 'redis' || src === 'mongodb' ? src : null;
      const lastSeenAt = typeof a.lastSeenAt === 'string' ? a.lastSeenAt : null;
      if (source && lastSeenAt) {
        return {
          ok: true,
          value: { status: 'ok', source, lastSeenAt },
        };
      }
    }
    if (status === 'not_available') {
      return { ok: true, value: { status: 'not_available' } };
    }
    if (status === 'error') {
      const e = ack as { message?: unknown };
      const msg =
        typeof e.message === 'string' ? e.message : 'presence:getLastSeen failed';
      return { ok: false, error: new Error(msg) };
    }
  }
  if (
    ack !== null &&
    typeof ack === 'object' &&
    'code' in ack &&
    typeof (ack as { code: unknown }).code === 'string'
  ) {
    const e = ack as { code: string; message?: unknown };
    const msg = typeof e.message === 'string' ? e.message : e.code;
    return { ok: false, error: new Error(msg) };
  }
  return { ok: false, error: new Error('Invalid presence:getLastSeen ack') };
}
