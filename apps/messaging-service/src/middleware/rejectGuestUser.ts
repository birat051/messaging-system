import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/errors/AppError.js';

/**
 * After **`requireAuthMiddleware`**: rejects **guest** sessions from **full-account** actions (profile/settings
 * updates, etc.). E2EE public-key routes and messaging stay available to guests.
 */
export function rejectGuestUserMiddleware() {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.authUser?.isGuest === true) {
      next(
        new AppError(
          'GUEST_ACTION_FORBIDDEN',
          403,
          'This action is not available for guest sessions',
        ),
      );
      return;
    }
    next();
  };
}
