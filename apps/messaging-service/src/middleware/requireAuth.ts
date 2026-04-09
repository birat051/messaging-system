import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { findUserById } from '../users/repo.js';
import type { UserDocument } from '../users/types.js';
import { resolveUploadUserId } from '../auth/resolveBearer.js';

/**
 * Resolves the caller from **`Authorization: Bearer`** (or dev **`X-User-Id`**), loads **`users`**, and
 * enforces **`emailVerified`** only when **`EMAIL_VERIFICATION_REQUIRED`** is **`true`**.
 */
export async function requireAuthenticatedUser(
  req: Request,
  env: Env,
): Promise<UserDocument> {
  const userId = await resolveUploadUserId(req, env);
  if (!userId) {
    throw new AppError(
      'UNAUTHORIZED',
      401,
      env.JWT_SECRET?.trim()
        ? 'Missing or invalid bearer token'
        : 'Set JWT_SECRET or use X-User-Id in non-production',
    );
  }
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('UNAUTHORIZED', 401, 'User not found');
  }
  if (env.EMAIL_VERIFICATION_REQUIRED && !user.emailVerified) {
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
