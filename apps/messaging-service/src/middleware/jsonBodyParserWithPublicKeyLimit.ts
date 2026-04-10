import express from 'express';
import type { Env } from '../config/env.js';

/**
 * **`express.json`** with a **smaller** cap for **`/v1/users/me/public-key`** (and **`.../rotate`**) so
 * oversized bodies fail with **413** before Zod/crypto validation. All other paths use the default **1mb** cap.
 */
export function createJsonBodyParserWithPublicKeyLimit(env: Env) {
  const publicKeyRoutes = express.json({
    limit: env.PUBLIC_KEY_JSON_BODY_MAX_BYTES,
  });
  const defaultJson = express.json({ limit: '1mb' });

  return (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void => {
    const path = req.path ?? '';
    if (path.startsWith('/v1/users/me/public-key')) {
      publicKeyRoutes(req, res, next);
      return;
    }
    defaultJson(req, res, next);
  };
}
