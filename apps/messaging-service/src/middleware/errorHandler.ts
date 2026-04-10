import type { NextFunction, Request, Response } from 'express';
import { loadEnv } from '../config/env.js';
import { AppError } from '../errors/AppError.js';

const env = loadEnv();

function isPayloadTooLarge(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) {
    return false;
  }
  const o = err as { status?: number; type?: string };
  if (o.status === 413) {
    return true;
  }
  return o.type === 'entity.too.large';
}

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
    req.log?.warn(
      { code: err.code, statusCode: err.statusCode },
      err.message,
    );
    res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
    return;
  }

  if (isPayloadTooLarge(err)) {
    req.log?.warn('request body too large');
    res.status(413).json({
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Request body exceeds size limit',
    });
    return;
  }

  const errMessage = err instanceof Error ? err.message : String(err);
  const errStack = err instanceof Error ? err.stack : undefined;
  req.log?.error(
    { errType: err instanceof Error ? err.constructor.name : typeof err, errMessage, errStack },
    'Unhandled error',
  );

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
