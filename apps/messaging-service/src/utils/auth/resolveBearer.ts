import type { Request } from 'express';
import { jwtVerify } from 'jose';
import type { Env } from '../../config/env.js';

/**
 * Verifies an access token string (**HS256**, `sub`) — shared by REST **`Authorization`** and
 * Socket.IO handshake **`auth.token`**.
 */
export async function verifyAccessTokenJwt(
  token: string,
  env: Env,
): Promise<string | undefined> {
  if (!env.JWT_SECRET?.trim()) {
    return undefined;
  }
  const trimmed = token.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    const secret = new TextEncoder().encode(env.JWT_SECRET);
    const { payload } = await jwtVerify(trimmed, secret, {
      algorithms: ['HS256'],
    });
    const sub = payload.sub;
    if (typeof sub === 'string' && sub.trim() !== '') {
      return sub.trim();
    }
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Resolves user id: **`Authorization: Bearer`** (HS256, `sub`) when **`JWT_SECRET`** is set;
 * otherwise in **non-production** only, **`X-User-Id`** header for local development.
 */
export async function resolveUploadUserId(
  req: Request,
  env: Env,
): Promise<string | undefined> {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith('Bearer ') && env.JWT_SECRET) {
    const token = bearer.slice('Bearer '.length).trim();
    if (!token) {
      return undefined;
    }
    return verifyAccessTokenJwt(token, env);
  }

  if (env.NODE_ENV !== 'production') {
    const raw = req.headers['x-user-id'];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return raw.trim();
    }
  }

  return undefined;
}
