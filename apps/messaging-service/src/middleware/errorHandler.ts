import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

const env = loadEnv();

/**
 * Global Express error handler — stable JSON body; no stack traces to clients in production.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    req.log?.warn({ err, code: err.code }, err.message);
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  req.log?.error({ err }, 'Unhandled error');

  const exposeMessage = env.NODE_ENV !== 'production';
  const message =
    exposeMessage && err instanceof Error
      ? err.message
      : 'Internal server error';

  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message,
  });
}
