import { Router } from 'express';
import multer from 'multer';
import type { Env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { requireUploadAuth } from '../middleware/uploadAuth.js';
import { getS3Client } from '../storage/s3Client.js';
import { uploadUserMediaToS3 } from '../storage/userMediaUpload.js';
import { formatZodError } from '../validation/formatZodError.js';
import { createMulterFileSchema } from '../validation/schemas.js';

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

        const { key, url } = await uploadUserMediaToS3(env, client, userId, {
          buffer: validFile.buffer,
          originalname: validFile.originalname,
          mimetype: validFile.mimetype,
        });

        res.status(201).json({
          key,
          bucket: env.S3_BUCKET,
          url,
        });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
