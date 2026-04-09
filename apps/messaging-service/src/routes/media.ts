import { Upload } from '@aws-sdk/lib-storage';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import multer from 'multer';
import type { Env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { requireUploadAuth } from '../middleware/uploadAuth.js';
import { getS3Client } from '../storage/s3Client.js';
import { formatZodError } from '../validation/formatZodError.js';
import { createMulterFileSchema } from '../validation/schemas.js';

function safeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 128);
  return base || 'file';
}

function buildObjectKey(env: Env, userId: string, filename: string): string {
  const prefix = env.S3_KEY_PREFIX?.replace(/^\/+|\/+$/g, '').trim();
  const middle = `users/${userId}/${randomUUID()}-${safeFilename(filename)}`;
  return prefix ? `${prefix}/${middle}` : middle;
}

/** Path-style public URL: `{base}/{bucket}/{key}` with per-segment encoding. */
function publicObjectUrl(env: Env, key: string): string | null {
  if (!env.S3_PUBLIC_BASE_URL || !env.S3_BUCKET) {
    return null;
  }
  const base = env.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
  const path = key
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
  return `${base}/${encodeURIComponent(env.S3_BUCKET)}/${path}`;
}

export function createMediaRouter(env: Env): Router {
  const router = Router();
  const client = getS3Client(env);
  if (!client || !env.S3_BUCKET) {
    return router;
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: env.MEDIA_MAX_BYTES },
  });
  const multerFileSchema = createMulterFileSchema(env.MEDIA_MAX_BYTES);

  router.post(
    '/media/upload',
    requireUploadAuth(env),
    (req, res, next) => {
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
    },
    async (req, res, next) => {
      try {
        const file = req.file;
        const userId = req.uploadUserId;
        if (!userId) {
          next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
          return;
        }
        if (!file) {
          next(
            new AppError(
              'INVALID_REQUEST',
              400,
              'Expected multipart field `file`',
            ),
          );
          return;
        }

        const fileCheck = multerFileSchema.safeParse(file);
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
        const validFile = fileCheck.data;

        const key = buildObjectKey(env, userId, validFile.originalname);
        const managed = new Upload({
          client,
          params: {
            Bucket: env.S3_BUCKET,
            Key: key,
            Body: validFile.buffer,
            ContentType: validFile.mimetype,
          },
        });
        await managed.done();

        res.status(201).json({
          key,
          bucket: env.S3_BUCKET,
          url: publicObjectUrl(env, key),
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
