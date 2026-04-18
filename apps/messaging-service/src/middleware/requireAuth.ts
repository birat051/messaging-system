import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { getEffectiveRuntimeConfig } from '../config/runtimeConfig.js';
import { AppError } from '../utils/errors/AppError.js';
import { findUserById } from '../data/users/repo.js';
import type { UserDocument } from '../data/users/users.collection.js';
import { resolveBearerAuth } from '../utils/auth/resolveBearer.js';

/**
 * Resolves the caller from **`Authorization: Bearer`** (or dev **`X-User-Id`**), loads **`users`**, and
 * enforces **`emailVerified`** only when **`emailVerificationRequired`** is **`true`** (MongoDB **`system_config`** or env default).
 * For **Bearer** JWTs, rejects when **`guest`** claim does not match **`user.isGuest`** (same token shape as Feature 2; branch on either).
 */
export async function requireAuthenticatedUser(
  req: Request,
  env: Env,
): Promise<UserDocument> {
  const auth = await resolveBearerAuth(req, env);
  if (!auth) {
    throw new AppError(
      'UNAUTHORIZED',
      401,
      env.JWT_SECRET?.trim()
        ? 'Missing or invalid bearer token'
        : 'Set JWT_SECRET or use X-User-Id in non-production',
    );
  }
  const user = await findUserById(auth.sub);
  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'User not found');
  }
  if (
    auth.kind === 'jwt' &&
    auth.guest !== (user.isGuest === true)
  ) {
    throw new AppError(
      'UNAUTHORIZED',
      401,
      'Access token does not match this user',
    );
  }
  if (
    (await getEffectiveRuntimeConfig(env)).emailVerificationRequired &&
    !user.emailVerified
  ) {
    throw new AppError(
      'EMAIL_NOT_VERIFIED',
      403,
      'Verify your email before using this resource',
    );
  }
  return user;
}

/** Sets **`req.authUser`** for handlers that need the full user document. */
export function requireAuthMiddleware(env: Env) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      req.authUser = await requireAuthenticatedUser(req, env);
      next();
    } catch (err: unknown) {
      next(err);
    }
  };
}
