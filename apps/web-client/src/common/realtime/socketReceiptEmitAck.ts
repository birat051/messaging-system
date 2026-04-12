/**
 * Parses Socket.IO ack for **`message:delivered`** / **`message:read`** / **`conversation:read`** emits.
 */
export function parseReceiptEmitAck(ack: unknown): { ok: true } | { ok: false; error: Error } {
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
  return { ok: false, error: new Error('Invalid receipt emit ack') };
}
