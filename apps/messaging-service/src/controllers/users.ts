import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import multer from 'multer';
import { rateLimitExceeded } from '../utils/auth/rateLimitRedis.js';
import { getClientIp } from '../utils/auth/getClientIp.js';
import type { Env } from '../config/env.js';
import { AppError } from '../utils/errors/AppError.js';
import { getS3Client } from '../data/storage/s3Client.js';
import {
  defaultUploadFilenameForContentType,
  presignPutUserMedia,
} from '../data/storage/presignUserMediaUpload.js';
import {
  isUserMediaObjectKeyOwnedByUser,
  publicObjectUrl,
  uploadUserMediaToS3,
} from '../data/storage/userMediaUpload.js';
import { searchUsersForCaller } from '../data/users/search.js';
import type { UpdateUserProfilePatch } from '../data/users/repo.js';
import { updateUserProfile } from '../data/users/repo.js';
import {
  applyBatchSyncMessageKeys,
  listSyncMessageKeysForUserDevice,
} from '../data/messages/syncMessageKeys.js';
import { findUserById } from '../data/users/repo.js';
import { toUserApiShape, toUserPublicShape } from '../data/users/publicUser.js';
import {
  deleteDeviceForUser,
  findDevicePublicKeysByUserId,
  registerOrUpdateDevice,
  resolvePublicKeyFetchAuthz,
  toDevicePublicKeysListResponse,
  toMyDevicesListResponse,
  toRegisterDeviceBootstrapResponse,
  toRegisterDeviceResponse,
} from '../data/userPublicKeys/index.js';
import {
  emitDeviceSyncComplete,
  emitDeviceSyncRequested,
} from '../utils/realtime/deviceSyncEvents.js';
import { formatZodError } from '../validation/formatZodError.js';
import { resolveListLimit } from '../validation/limitQuery.js';
import {
  createMulterFileSchema,
  batchSyncMessageKeysRequestSchema,
  deviceIdPathSchema,
  listSyncMessageKeysQuerySchema,
  patchProfileJsonBodySchema,
  registerDeviceRequestSchema,
  searchUsersQuerySchema,
  userIdPathSchema,
} from '../validation/schemas.js';
import type { AvatarPresignRequestInput } from '../validation/schemas.js';

export function rateLimitPublicKeyWrites(env: Env): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const rlKey = `ratelimit:user-public-key:user:${authUser.id}`;
      if (
        await rateLimitExceeded(
          rlKey,
          env.PUBLIC_KEY_UPDATE_RATE_LIMIT_WINDOW_SEC,
          env.PUBLIC_KEY_UPDATE_RATE_LIMIT_MAX,
        )
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many public key updates; try again later',
          ),
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function rateLimitDeviceSyncBatch(env: Env): RequestHandler {
  return async (
    req: Request,
    _res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const rlKey = `ratelimit:device-sync-batch:user:${authUser.id}`;
      if (
        await rateLimitExceeded(
          rlKey,
          env.DEVICE_SYNC_RATE_LIMIT_WINDOW_SEC,
          env.DEVICE_SYNC_RATE_LIMIT_MAX,
        )
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many device sync batch uploads; try again later',
          ),
        );
        return;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getSearchUsers(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const ip = getClientIp(req);
      const guestSearch = authUser.isGuest === true;
      const rlWindow = guestSearch
        ? env.GUEST_USER_SEARCH_RATE_LIMIT_WINDOW_SEC
        : env.USER_SEARCH_RATE_LIMIT_WINDOW_SEC;
      const rlMax = guestSearch
        ? env.GUEST_USER_SEARCH_RATE_LIMIT_MAX
        : env.USER_SEARCH_RATE_LIMIT_MAX;
      const key = guestSearch
        ? `ratelimit:users-search:guest-ip:${ip}`
        : `ratelimit:users-search:ip:${ip}`;
      if (await rateLimitExceeded(key, rlWindow, rlMax)) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many search requests; try again later',
          ),
        );
        return;
      }

      const q = req.query as unknown as z.infer<typeof searchUsersQuerySchema>;

      const rows = await searchUsersForCaller({
        callerUserId: authUser.id,
        callerIsGuest: authUser.isGuest === true,
        query: q.q,
        limit: resolveListLimit(q.limit),
        maxCandidateScanCap: env.USER_SEARCH_MAX_CANDIDATE_SCAN,
      });
      res.status(200).json(rows);
    } catch (err) {
      next(err);
    }
  };
}

export const getMe: RequestHandler = (req, res, next) => {
  try {
    const user = req.authUser;
    if (!user) {
      next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
      return;
    }
    res.status(200).json(toUserApiShape(user));
  } catch (err) {
    next(err);
  }
};

/**
 * **`GET /users/{userId}`** — public profile for messaging UI (thread title / list row).
 * **Authz:** **self** always; otherwise **guest ↔ guest** or **registered ↔ registered** only (sandbox separation).
 */
export function getUserById(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const raw = (req.params as { userId?: string }).userId?.trim() ?? '';
      if (raw.length === 0) {
        next(new AppError('NOT_FOUND', 404, 'User not found'));
        return;
      }
      if (raw === 'me') {
        next(
          new AppError(
            'BAD_REQUEST',
            400,
            'Use GET /users/me for the current user',
          ),
        );
        return;
      }

      const target = await findUserById(raw);
      if (!target) {
        next(new AppError('NOT_FOUND', 404, 'User not found'));
        return;
      }

      if (authUser.id !== target.id) {
        const callerGuest = authUser.isGuest === true;
        const targetGuest = target.isGuest === true;
        if (callerGuest !== targetGuest) {
          next(
            new AppError(
              'FORBIDDEN',
              403,
              'Profile not visible for this session type',
            ),
          );
          return;
        }
      }

      res.status(200).json(toUserPublicShape(target));
    } catch (err) {
      next(err);
    }
  };
}

export function patchMeMultipart(
  upload: multer.Multer,
): RequestHandler {
  return (req, res, next) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        if (
          err instanceof multer.MulterError &&
          err.code === 'LIMIT_FILE_SIZE'
        ) {
          next(
            new AppError(
              'PAYLOAD_TOO_LARGE',
              413,
              'File exceeds configured size limit',
            ),
          );
          return;
        }
        next(err);
        return;
      }
      next();
    });
  };
}

function patchMeMultipartBody(
  env: Env,
  s3Client: ReturnType<typeof getS3Client>,
  multerFileSchema: ReturnType<typeof createMulterFileSchema>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }

      const body = req.body as Record<string, string | undefined>;
      const hasFile = Boolean(req.file);
      const hasStatusKey = Object.prototype.hasOwnProperty.call(body, 'status');
      const hasDisplayNameKey = Object.prototype.hasOwnProperty.call(
        body,
        'displayName',
      );

      if (!hasFile && !hasStatusKey && !hasDisplayNameKey) {
        next(
          new AppError(
            'INVALID_REQUEST',
            400,
            'Provide at least one of multipart fields: file, status, displayName',
          ),
        );
        return;
      }

      const patch: UpdateUserProfilePatch = {};

      if (hasFile) {
        if (!s3Client || !env.S3_BUCKET) {
          next(
            new AppError(
              'MEDIA_NOT_CONFIGURED',
              503,
              'Profile image upload requires S3 (S3_BUCKET and credentials)',
            ),
          );
          return;
        }
        const fileCheck = multerFileSchema.safeParse(req.file);
        if (!fileCheck.success) {
          next(
            new AppError(
              'INVALID_REQUEST',
              400,
              formatZodError(fileCheck.error),
              fileCheck.error,
            ),
          );
          return;
        }
        const f = fileCheck.data;
        if (!f.mimetype.startsWith('image/')) {
          next(
            new AppError(
              'INVALID_REQUEST',
              400,
              'Profile file must be an image (image/*)',
            ),
          );
          return;
        }
        const { url } = await uploadUserMediaToS3(env, s3Client, authUser.id, {
          buffer: f.buffer,
          originalname: f.originalname,
          mimetype: f.mimetype,
        });
        patch.profilePicture = url;
      }

      if (hasStatusKey) {
        const raw = body.status;
        if (raw === undefined || raw === '') {
          patch.status = null;
        } else {
          const s = String(raw).trim();
          if (s.length > 280) {
            next(
              new AppError(
                'INVALID_REQUEST',
                400,
                'status exceeds 280 characters',
              ),
            );
            return;
          }
          patch.status = s;
        }
      }

      if (hasDisplayNameKey) {
        const raw = body.displayName;
        if (raw === undefined || String(raw).trim() === '') {
          next(
            new AppError(
              'INVALID_REQUEST',
              400,
              'displayName must be a non-empty string when provided',
            ),
          );
          return;
        }
        const dn = String(raw).trim();
        if (dn.length > 200) {
          next(
            new AppError(
              'INVALID_REQUEST',
              400,
              'displayName exceeds 200 characters',
            ),
          );
          return;
        }
        patch.displayName = dn;
      }

      const updated = await updateUserProfile(authUser.id, patch);
      if (!updated) {
        next(new AppError('UNAUTHORIZED', 401, 'User not found'));
        return;
      }
      res.status(200).json(toUserApiShape(updated));
    } catch (err) {
      next(err);
    }
  };
}

function patchMeJsonBody(
  env: Env,
  _s3Client: ReturnType<typeof getS3Client>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }

      const parsed = patchProfileJsonBodySchema.safeParse(req.body);
      if (!parsed.success) {
        next(
          new AppError(
            'INVALID_REQUEST',
            400,
            formatZodError(parsed.error),
            parsed.error,
          ),
        );
        return;
      }
      const json = parsed.data;
      const patch: UpdateUserProfilePatch = {};

      if (json.profilePictureMediaKey !== undefined) {
        if (!isUserMediaObjectKeyOwnedByUser(env, authUser.id, json.profilePictureMediaKey)) {
          next(
            new AppError(
              'INVALID_REQUEST',
              400,
              'profilePictureMediaKey does not match this user upload prefix',
            ),
          );
          return;
        }
        const url = publicObjectUrl(env, json.profilePictureMediaKey);
        patch.profilePicture = url ?? json.profilePictureMediaKey;
      } else if (json.profilePicture !== undefined) {
        patch.profilePicture = json.profilePicture;
      }

      if (json.displayName !== undefined) {
        patch.displayName = json.displayName;
      }
      if (json.status !== undefined) {
        patch.status = json.status;
      }

      const updated = await updateUserProfile(authUser.id, patch);
      if (!updated) {
        next(new AppError('UNAUTHORIZED', 401, 'User not found'));
        return;
      }
      res.status(200).json(toUserApiShape(updated));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * **`PATCH /users/me`** — **`application/json`** (URL / object key after presigned **`PUT`**) or **`multipart/form-data`**
 * (legacy direct file upload).
 */
export function patchMe(
  env: Env,
  s3Client: ReturnType<typeof getS3Client>,
  upload: multer.Multer,
): RequestHandler {
  const multerFileSchema = createMulterFileSchema(env.MEDIA_MAX_BYTES);
  const multipartHandler = patchMeMultipartBody(env, s3Client, multerFileSchema);
  const jsonHandler = patchMeJsonBody(env, s3Client);
  return (req, res, next) => {
    const ct = String(req.headers['content-type'] ?? '').toLowerCase();
    if (ct.includes('application/json')) {
      void jsonHandler(req, res, next);
      return;
    }
    patchMeMultipart(upload)(req, res, (err: unknown) => {
      if (err) {
        next(err);
        return;
      }
      void multipartHandler(req, res, next);
    });
  };
}

/** **`POST /users/me/avatar/presign`** — pre-signed **`PUT`** for **`users/{userId}/…`** keys (image MIME only). */
export function postMyAvatarPresign(
  env: Env,
  s3Client: ReturnType<typeof getS3Client>,
): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      if (!s3Client || !env.S3_BUCKET) {
        next(
          new AppError(
            'MEDIA_NOT_CONFIGURED',
            503,
            'Avatar presign requires S3 (S3_BUCKET and credentials)',
          ),
        );
        return;
      }
      const body = req.body as AvatarPresignRequestInput;
      const filename =
        body.filename ?? defaultUploadFilenameForContentType(body.contentType);
      const out = await presignPutUserMedia(env, authUser.id, {
        contentType: body.contentType,
        contentLength: body.contentLength,
        filename,
      });
      res.status(200).json(out);
    } catch (err) {
      next(err);
    }
  };
}

export function postBatchSyncMessageKeys(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const sourceDeviceId = req.authSourceDeviceId;
      if (sourceDeviceId === undefined || sourceDeviceId.trim() === '') {
        next(
          new AppError(
            'FORBIDDEN',
            403,
            'A device-bound access token is required (sourceDeviceId claim). Re-authenticate via login or refresh, passing an optional sourceDeviceId that matches a registered device.',
          ),
        );
        return;
      }
      const body = req.body as z.infer<typeof batchSyncMessageKeysRequestSchema>;
      const result = await applyBatchSyncMessageKeys({
        userId: authUser.id,
        sourceDeviceId: sourceDeviceId.trim(),
        targetDeviceId: body.targetDeviceId,
        keys: body.keys,
      });
      if (result.applied > 0) {
        emitDeviceSyncComplete({
          userId: authUser.id,
          targetDeviceId: body.targetDeviceId,
        });
      }
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}

export function getSyncMessageKeys(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const q = req.query as unknown as z.infer<typeof listSyncMessageKeysQuerySchema>;
      const payload = await listSyncMessageKeysForUserDevice({
        userId: authUser.id,
        deviceId: q.deviceId,
        afterMessageId: q.afterMessageId,
        limit: q.limit,
      });
      res.status(200).json(payload);
    } catch (err) {
      next(err);
    }
  };
}

export function getMyDevices(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const docs = await findDevicePublicKeysByUserId(authUser.id);
      res.status(200).json(toMyDevicesListResponse(docs));
    } catch (err) {
      next(err);
    }
  };
}

export function postRegisterDevice(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const body = req.body as z.infer<typeof registerDeviceRequestSchema>;
      const outcome = await registerOrUpdateDevice(
        authUser.id,
        body.publicKey,
        body.deviceId,
        body.deviceLabel,
      );
      if (outcome.isNewDeviceRow) {
        emitDeviceSyncRequested({
          userId: authUser.id,
          newDeviceId: outcome.document.deviceId,
          newDevicePublicKey: outcome.document.publicKey,
        });
      }
      if (body.bootstrap) {
        res.status(201).json(toRegisterDeviceBootstrapResponse(outcome.document));
        return;
      }
      res.status(200).json(toRegisterDeviceResponse(outcome.document));
    } catch (err) {
      next(err);
    }
  };
}

/**
 * **`DELETE /users/me/devices/:deviceId`** — owning user only (**`authUser.id`** + path **`deviceId`**).
 * See OpenAPI for registry vs message-document behavior.
 */
export function deleteMyDevice(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const params = req.params as z.infer<typeof deviceIdPathSchema>;
      const removed = await deleteDeviceForUser(authUser.id, params.deviceId);
      if (!removed) {
        next(new AppError('NOT_FOUND', 404, 'Device not found'));
        return;
      }
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}

export function getUserDevicePublicKeys(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const params = req.params as z.infer<typeof userIdPathSchema>;
      let targetUserId = params.userId.trim();
      if (targetUserId === 'me') {
        targetUserId = authUser.id;
      }

      const authz = await resolvePublicKeyFetchAuthz(
        authUser.id,
        targetUserId,
        env,
      );
      if (authz === 'target_not_found') {
        next(new AppError('NOT_FOUND', 404, 'Not found'));
        return;
      }
      if (authz === 'forbidden') {
        next(
          new AppError(
            'FORBIDDEN',
            403,
            'Not allowed to list this user device keys',
          ),
        );
        return;
      }

      const docs = await findDevicePublicKeysByUserId(targetUserId);
      res.status(200).json(toDevicePublicKeysListResponse(docs));
    } catch (err) {
      next(err);
    }
  };
}

