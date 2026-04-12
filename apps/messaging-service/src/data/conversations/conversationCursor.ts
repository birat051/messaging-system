import { AppError } from '../../utils/errors/AppError.js';

export type ConversationListCursor = {
  updatedAt: Date;
  id: string;
};

/**
 * Opaque **`nextCursor`** for **`GET /conversations`** — base64url JSON **`{ t, id }`** (**`t`** = **`updatedAt`** ISO).
 */
export function encodeConversationListCursor(
  cursor: ConversationListCursor,
): string {
  const payload = JSON.stringify({
    t: cursor.updatedAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Parses a client-supplied **`cursor`** query param; throws **`INVALID_REQUEST`** (**400**) when malformed.
 */
export function parseConversationListCursor(raw: string): ConversationListCursor {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new AppError('INVALID_REQUEST', 400, 'Invalid cursor');
  }
  let parsed: unknown;
  try {
    const json = Buffer.from(trimmed, 'base64url').toString('utf8');
    parsed = JSON.parse(json);
  } catch {
    throw new AppError('INVALID_REQUEST', 400, 'Invalid cursor');
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new AppError('INVALID_REQUEST', 400, 'Invalid cursor');
  }
  const o = parsed as Record<string, unknown>;
  const t = o.t;
  const id = o.id;
  if (typeof t !== 'string' || typeof id !== 'string' || id.trim().length === 0) {
    throw new AppError('INVALID_REQUEST', 400, 'Invalid cursor');
  }
  const updatedAt = new Date(t);
  if (Number.isNaN(updatedAt.getTime())) {
    throw new AppError('INVALID_REQUEST', 400, 'Invalid cursor');
  }
  return { updatedAt, id: id.trim() };
}
