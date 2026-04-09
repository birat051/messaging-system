import type { NextFunction, Request, Response } from 'express';
import type { ParsedQs } from 'qs';
import type { z } from 'zod';
import { AppError } from '../errors/AppError.js';
import { formatZodError } from './formatZodError.js';
import { normalizeQueryForZod } from './normalizeQuery.js';

/**
 * Validates `req.body` after `express.json()`. On success, replaces `req.body` with parsed output.
 */
export function validateBody(schema: z.ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(
        new AppError(
          'INVALID_REQUEST',
          400,
          formatZodError(result.error),
          result.error,
        ),
      );
      return;
    }
    req.body = result.data as Request['body'];
    next();
  };
}

/**
 * Validates normalized `req.query` (first value per key if repeated).
 */
export function validateQuery(schema: z.ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const normalized = normalizeQueryForZod(req.query as ParsedQs);
    const result = schema.safeParse(normalized);
    if (!result.success) {
      next(
        new AppError(
          'INVALID_REQUEST',
          400,
          formatZodError(result.error),
          result.error,
        ),
      );
      return;
    }
    Object.assign(req.query, result.data);
    next();
  };
}

/**
 * Validates `req.params`.
 */
export function validateParams(schema: z.ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      next(
        new AppError(
          'INVALID_REQUEST',
          400,
          formatZodError(result.error),
          result.error,
        ),
      );
      return;
    }
    req.params = result.data as Request['params'];
    next();
  };
}
