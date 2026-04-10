import type { Message } from './socketWorkerProtocol';

function isSuccessMessageAck(ack: unknown): ack is Message {
  return (
    ack !== null &&
    typeof ack === 'object' &&
    'id' in ack &&
    typeof (ack as Message).id === 'string' &&
    'conversationId' in ack &&
    typeof (ack as Message).conversationId === 'string'
  );
}

/**
 * Maps a **`message:send`** server **ack** (success **`Message`** vs **`{ code, message? }`**) to resolve/reject.
 * Used by **`createSocketWorkerBridge`** and covered by **`socketMessageAck.test.ts`** (Vitest cannot drive Socket.IO through MSW).
 */
export function parseMessageSendAck(ack: unknown): { ok: true; message: Message } | { ok: false; error: Error } {
  if (isSuccessMessageAck(ack)) {
    return { ok: true, message: ack };
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
  return { ok: false, error: new Error('Invalid message:send ack') };
}
