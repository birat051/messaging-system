import type { Request } from 'express';
import { jwtVerify } from 'jose';
import type { Env } from '../../config/env.js';

/**
 * Verified access JWT (**HS256**, `sub`, optional **`guest`** claim) — shared by REST **`Authorization`**
 * and Socket.IO handshake **`auth.token`**.
 */
export type VerifiedAccessToken = {
  sub: string;
  /** True when the JWT payload includes **`guest: true`** (guest session from **`POST /auth/guest`** or refresh). */
  guest: boolean;
};

/**
 * Verifies an access token string (**HS256**, `sub`, **`guest`** optional) — shared by REST **`Authorization`** and
 * Socket.IO handshake **`auth.token`**.
 */
export async function verifyAccessTokenJwt(
  token: string,
  env: Env,
): Promise<VerifiedAccessToken | undefined> {
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
    if (typeof sub !== 'string' || sub.trim() === '') {
      return undefined;
    }
    const guest = payload.guest === true;
    return { sub: sub.trim(), guest };
  } catch {
    return undefined;
  }
}

/**
 * JWT path (Bearer) or dev **`X-User-Id`** bypass — used by **`requireAuthenticatedUser`** to enforce
 * **`guest`** claim vs **`users.isGuest`** for Bearer tokens only.
 */
export type ResolveBearerAuthResult =
  | { kind: 'jwt'; sub: string; guest: boolean }
  | { kind: 'dev'; sub: string };

export async function resolveBearerAuth(
  req: Request,
  env: Env,
): Promise<ResolveBearerAuthResult | undefined> {
  const bearer = req.headers.authorization;
  if (bearer?.startsWith('Bearer ') && env.JWT_SECRET) {
    const token = bearer.slice('Bearer '.length).trim();
    if (!token) {
      return undefined;
    }
    const v = await verifyAccessTokenJwt(token, env);
    if (!v) {
      return undefined;
    }
    return { kind: 'jwt', sub: v.sub, guest: v.guest };
  }

  if (env.NODE_ENV !== 'production') {
    const raw = req.headers['x-user-id'];
    if (typeof raw === 'string' && raw.trim() !== '') {
      return { kind: 'dev', sub: raw.trim() };
    }
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
  const auth = await resolveBearerAuth(req, env);
  return auth?.sub;
}
