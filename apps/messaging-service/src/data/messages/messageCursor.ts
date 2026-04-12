import { AppError } from '../../utils/errors/AppError.js';

export type MessageListCursor = {
  createdAt: Date;
  id: string;
};

/**
 * Opaque **`nextCursor`** for **`GET /conversations/{id}/messages`** — base64url JSON **`{ t, id }`**.
 */
export function encodeMessageListCursor(cursor: MessageListCursor): string {
  const payload = JSON.stringify({
    t: cursor.createdAt.toISOString(),
    id: cursor.id,
  });
  return Buffer.from(payload, 'utf8').toString('base64url');
}

/**
 * Parses a client-supplied **`cursor`** query param; throws **`INVALID_REQUEST`** (**400**) when malformed.
 */
export function parseMessageListCursor(raw: string): MessageListCursor {
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
  const createdAt = new Date(t);
  if (Number.isNaN(createdAt.getTime())) {
    throw new AppError('INVALID_REQUEST', 400, 'Invalid cursor');
  }
  return { createdAt, id: id.trim() };
}
