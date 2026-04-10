import type { Socket } from 'socket.io';
import { verifyAccessTokenJwt } from '../auth/resolveBearer.js';
import type { Env } from '../config/env.js';
import { getEffectiveRuntimeConfig } from '../config/runtimeConfig.js';
import { findUserById } from '../users/repo.js';
import type { UserDocument } from '../users/types.js';

export type SocketAuthResult =
  | { kind: 'ok'; user: UserDocument }
  | { kind: 'unauthenticated' }
  | { kind: 'email_not_verified' };

function readUserIdFromHandshakeAuth(auth: unknown): string | undefined {
  if (auth === null || typeof auth !== 'object') {
    return undefined;
  }
  const userId = (auth as { userId?: unknown }).userId;
  if (typeof userId !== 'string') {
    return undefined;
  }
  const trimmed = userId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Bearer JWT from **`auth.token`**, **`auth.accessToken`**, **`auth.authorization`**, or
 * **`handshake.headers.authorization`** — aligned with REST **`Authorization`**.
 */
async function resolveUserIdFromSocketHandshake(
  socket: Socket,
  env: Env,
): Promise<string | undefined> {
  const auth = socket.handshake.auth;
  const headers = socket.handshake.headers;

  let token: string | undefined;
  if (auth !== null && typeof auth === 'object') {
    const a = auth as Record<string, unknown>;
    if (typeof a.token === 'string') {
      token = a.token.trim();
    } else if (typeof a.accessToken === 'string') {
      token = a.accessToken.trim();
    } else if (typeof a.authorization === 'string') {
      const raw = a.authorization.trim();
      if (raw.startsWith('Bearer ')) {
        token = raw.slice('Bearer '.length).trim();
      }
    }
  }

  const headerAuth = headers.authorization;
  if (!token && typeof headerAuth === 'string' && headerAuth.startsWith('Bearer ')) {
    token = headerAuth.slice('Bearer '.length).trim();
  }

  if (token && env.JWT_SECRET?.trim()) {
    const sub = await verifyAccessTokenJwt(token, env);
    if (sub) {
      return sub;
    }
    return undefined;
  }

  if (env.NODE_ENV !== 'production') {
    const raw = readUserIdFromHandshakeAuth(auth);
    if (raw) {
      return raw;
    }
  }

  return undefined;
}

/**
 * Same guarantees as **`requireAuthenticatedUser`** (`JWT` + `users` lookup + optional email gate),
 * using Socket.IO handshake auth instead of `Request` headers.
 *
 * **Call once per connection** (in the **`connection`** handler). Do not invoke again per message
 * or event — downstream handlers read **`socket.data.authAtConnect`** only.
 */
export async function resolveSocketAuth(
  socket: Socket,
  env: Env,
): Promise<SocketAuthResult> {
  const userId = await resolveUserIdFromSocketHandshake(socket, env);
  if (!userId) {
    return { kind: 'unauthenticated' };
  }

  const user = await findUserById(userId);
  if (!user) {
    return { kind: 'unauthenticated' };
  }

  if (
    (await getEffectiveRuntimeConfig(env)).emailVerificationRequired &&
    !user.emailVerified
  ) {
    return { kind: 'email_not_verified' };
  }

  return { kind: 'ok', user };
}
