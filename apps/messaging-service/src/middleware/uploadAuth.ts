import type { NextFunction, Request, Response } from 'express';
import type { Env } from '../config/env.js';
import { requireAuthenticatedUser } from './requireAuth.js';

export function requireUploadAuth(env: Env) {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const { user } = await requireAuthenticatedUser(req, env);
      req.uploadUserId = user.id;
      req.authUser = user;
      next();
    } catch (err: unknown) {
      next(err);
    }
  };
}
