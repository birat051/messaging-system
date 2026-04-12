import type { NextFunction, Request, Response } from 'express';
import { getClientIp } from '../utils/auth/getClientIp.js';
import type { Env } from '../config/env.js';
import { AppError } from '../utils/errors/AppError.js';
import { isGlobalRestRateLimitExceeded } from '../utils/rateLimit/globalRestRateLimit.js';

/**
 * Paths under **`/v1`** that skip the global per-IP counter (liveness/readiness).
 * **`/api-docs`** is not mounted under **`/v1`** and is unaffected.
 */
function isExcludedPath(pathname: string): boolean {
  const p = pathname.split('?')[0] ?? '';
  // Mounted as `app.use('/v1', …)` — Express sets `req.path` to `/health` / `/ready` (mount stripped).
  return (
    p === '/health' ||
    p === '/ready' ||
    p === '/v1/health' ||
    p === '/v1/ready'
  );
}

/**
 * Early **`app.use('/v1', …)`** — Redis fixed-window per **`getClientIp(req)`** ( **`trust proxy`** ).
 * **Stacks** with route-specific limits (**`REGISTER_RATE_LIMIT_*`**, **`USER_SEARCH_RATE_LIMIT_*`**, …): global
 * **`INCR`** runs first; handlers use **separate** keys — see **`docs/ENVIRONMENT.md`** (*Global vs per-route*).
 */
export function createGlobalRestRateLimitMiddleware(env: Env) {
  return async function globalRestRateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    if (isExcludedPath(req.path)) {
      next();
      return;
    }

    const ip = getClientIp(req);
    try {
      if (await isGlobalRestRateLimitExceeded(env, ip)) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many requests; try again later',
          ),
        );
        return;
      }
    } catch (err) {
      next(err);
      return;
    }
    next();
  };
}
