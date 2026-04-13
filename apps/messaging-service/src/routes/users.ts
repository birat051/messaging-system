import { Router } from 'express';
import multer from 'multer';
import type { Env } from '../config/env.js';
import {
  getMe,
  getSearchUsers,
  getUserPublicKey,
  patchMe,
  patchMeMultipart,
  postRotatePublicKey,
  putPublicKey,
  rateLimitPublicKeyWrites,
} from '../controllers/users.js';
import { requireAuthMiddleware } from '../middleware/requireAuth.js';
import { getS3Client } from '../data/storage/s3Client.js';
import { validateBody, validateParams, validateQuery } from '../validation/middleware.js';
import {
  createSearchUsersQuerySchema,
  putPublicKeyRequestSchema,
  rotatePublicKeyRequestSchema,
  userIdPathSchema,
} from '../validation/schemas.js';

/**
 * User profile, search, E2EE public key directory — **wiring only**. Handlers live in **`src/controllers/users.ts`**.
 * User-search and public-key PUT/POST rate limits **stack** with the global REST cap (global middleware runs first).
 */
export function createUsersRouter(env: Env): Router {
  const router = Router();
  const s3Client = getS3Client(env);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MEDIA_MAX_BYTES },
  });

  router.get(
    '/users/search',
    requireAuthMiddleware(env),
    validateQuery(createSearchUsersQuerySchema(env.USER_SEARCH_MIN_QUERY_LENGTH)),
    getSearchUsers(env),
  );

  router.get('/users/me', requireAuthMiddleware(env), getMe);

  router.patch(
    '/users/me',
    requireAuthMiddleware(env),
    patchMeMultipart(upload),
    patchMe(env, s3Client),
  );

  router.put(
    '/users/me/public-key',
    requireAuthMiddleware(env),
    rateLimitPublicKeyWrites(env),
    validateBody(putPublicKeyRequestSchema),
    putPublicKey(),
  );

  router.post(
    '/users/me/public-key/rotate',
    requireAuthMiddleware(env),
    rateLimitPublicKeyWrites(env),
    validateBody(rotatePublicKeyRequestSchema),
    postRotatePublicKey(),
  );

  router.get(
    '/users/:userId/public-key',
    requireAuthMiddleware(env),
    validateParams(userIdPathSchema),
    getUserPublicKey(env),
  );

  return router;
}
