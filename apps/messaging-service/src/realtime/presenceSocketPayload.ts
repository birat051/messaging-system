import { getLastSeenPayloadSchema } from '../validation/schemas.js';

/**
 * Client → server: `socket.emit('presence:getLastSeen', { targetUserId: string }, ack)`
 * (Zod-validated shape aligned with Feature 6.)
 */
export function parseGetLastSeenPayload(raw: unknown): string | undefined {
  const result = getLastSeenPayloadSchema.safeParse(raw);
  if (!result.success) {
    return undefined;
  }
  return result.data.targetUserId;
}
