import { Router } from 'express';
import multer from 'multer';
import type { Env } from '../config/env.js';
import {
  deleteMyDevice,
  getMe,
  getMyDevices,
  getSyncMessageKeys,
  postBatchSyncMessageKeys,
  getSearchUsers,
  getUserDevicePublicKeys,
  patchMe,
  patchMeMultipart,
  postRegisterDevice,
  rateLimitDeviceSyncBatch,
  rateLimitPublicKeyWrites,
} from '../controllers/users.js';
import { requireAuthMiddleware } from '../middleware/requireAuth.js';
import { rejectGuestUserMiddleware } from '../middleware/rejectGuestUser.js';
import { getS3Client } from '../data/storage/s3Client.js';
import {
  validateBody,
  validateParams,
  validateQuery,
} from '../validation/middleware.js';
import {
  batchSyncMessageKeysRequestSchema,
  createSearchUsersQuerySchema,
  deviceIdPathSchema,
  listMyDevicesQuerySchema,
  listSyncMessageKeysQuerySchema,
  registerDeviceRequestSchema,
  userIdPathSchema,
} from '../validation/schemas.js';

/**
 * User profile, search, E2EE public key directory — **wiring only**. Handlers live in **`src/controllers/users.ts`**.
 * **`PATCH /users/me`** uses **`rejectGuestUserMiddleware`** after auth (guests cannot update profile — **Feature 2a**).
 * User-search and device-key **`POST`/`DELETE`** rate limits **stack** with the global REST cap (global middleware runs first).
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
    rejectGuestUserMiddleware(),
    patchMeMultipart(upload),
    patchMe(env, s3Client),
  );

  router.get(
    '/users/me/devices',
    requireAuthMiddleware(env),
    validateQuery(listMyDevicesQuerySchema),
    getMyDevices(),
  );

  router.get(
    '/users/me/sync/message-keys',
    requireAuthMiddleware(env),
    validateQuery(listSyncMessageKeysQuerySchema),
    getSyncMessageKeys(),
  );

  router.post(
    '/users/me/sync/message-keys',
    requireAuthMiddleware(env),
    rateLimitDeviceSyncBatch(env),
    validateBody(batchSyncMessageKeysRequestSchema),
    postBatchSyncMessageKeys(),
  );

  router.post(
    '/users/me/devices',
    requireAuthMiddleware(env),
    rateLimitPublicKeyWrites(env),
    validateBody(registerDeviceRequestSchema),
    postRegisterDevice(),
  );

  router.delete(
    '/users/me/devices/:deviceId',
    requireAuthMiddleware(env),
    rateLimitPublicKeyWrites(env),
    validateParams(deviceIdPathSchema),
    deleteMyDevice(),
  );

  router.get(
    '/users/:userId/devices/public-keys',
    requireAuthMiddleware(env),
    validateParams(userIdPathSchema),
    getUserDevicePublicKeys(env),
  );

  return router;
}
