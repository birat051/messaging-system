/**
 * Parses Socket.IO ack for **`webrtc:offer`**, **`webrtc:answer`**, **`webrtc:candidate`** emits.
 */
export function parseWebRtcEmitAck(ack: unknown): { ok: true } | { ok: false; error: Error } {
  if (
    ack !== null &&
    typeof ack === 'object' &&
    'ok' in ack &&
    (ack as { ok: unknown }).ok === true
  ) {
    return { ok: true };
  }
  if (
    ack !== null &&
    typeof ack === 'object' &&
    'code' in ack &&
    typeof (ack as { code: unknown }).code === 'string'
  ) {
    const e = ack as unknown as { code: string; message?: unknown };
    const msg = typeof e.message === 'string' ? e.message : e.code;
    return { ok: false, error: new Error(msg) };
  }
  return { ok: false, error: new Error('Invalid WebRTC emit ack') };
}
