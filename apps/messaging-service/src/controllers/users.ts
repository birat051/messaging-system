import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { z } from 'zod';
import multer from 'multer';
import { rateLimitExceeded } from '../utils/auth/rateLimitRedis.js';
import { getClientIp } from '../utils/auth/getClientIp.js';
import type { Env } from '../config/env.js';
import { AppError } from '../utils/errors/AppError.js';
import { getS3Client } from '../data/storage/s3Client.js';
import { uploadUserMediaToS3 } from '../data/storage/userMediaUpload.js';
import { searchUsersForCaller } from '../data/users/search.js';
import type { UpdateUserProfilePatch } from '../data/users/repo.js';
import { updateUserProfile } from '../data/users/repo.js';
import { toUserApiShape } from '../data/users/publicUser.js';
import {
  findPublicKeyByUserId,
  resolvePublicKeyFetchAuthz,
  rotatePublicKey,
  toUserPublicKeyResponse,
  upsertPublicKeyPut,
} from '../data/userPublicKeys/index.js';
import { formatZodError } from '../validation/formatZodError.js';
import { resolveListLimit } from '../validation/limitQuery.js';
import {
  createMulterFileSchema,
  putPublicKeyRequestSchema,
  rotatePublicKeyRequestSchema,
  searchUsersQuerySchema,
  userIdPathSchema,
} from '../validation/schemas.js';

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

export function getSearchUsers(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const ip = getClientIp(req);
      const key = `ratelimit:users-search:ip:${ip}`;
      if (
        await rateLimitExceeded(
          key,
          env.USER_SEARCH_RATE_LIMIT_WINDOW_SEC,
          env.USER_SEARCH_RATE_LIMIT_MAX,
        )
      ) {
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

export function patchMe(env: Env, s3Client: ReturnType<typeof getS3Client>): RequestHandler {
  const multerFileSchema = createMulterFileSchema(env.MEDIA_MAX_BYTES);
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

export function putPublicKey(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const body = req.body as z.infer<typeof putPublicKeyRequestSchema>;
      const doc = await upsertPublicKeyPut(
        authUser.id,
        body.publicKey,
        body.keyVersion,
      );
      res.status(200).json(toUserPublicKeyResponse(doc));
    } catch (err) {
      next(err);
    }
  };
}

export function postRotatePublicKey(): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = req.authUser;
      if (!authUser) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const body = req.body as z.infer<typeof rotatePublicKeyRequestSchema>;
      const doc = await rotatePublicKey(authUser.id, body.publicKey);
      res.status(200).json(toUserPublicKeyResponse(doc));
    } catch (err) {
      next(err);
    }
  };
}

export function getUserPublicKey(env: Env): RequestHandler {
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
            'Not allowed to fetch this user public key',
          ),
        );
        return;
      }

      const doc = await findPublicKeyByUserId(targetUserId);
      if (!doc) {
        next(new AppError('NOT_FOUND', 404, 'Not found'));
        return;
      }
      res.status(200).json(toUserPublicKeyResponse(doc));
    } catch (err) {
      next(err);
    }
  };
}
