import type { S3Client } from '@aws-sdk/client-s3';
import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import { AppError } from '../utils/errors/AppError.js';
import { uploadUserMediaToS3 } from '../data/storage/userMediaUpload.js';
import { formatZodError } from '../validation/formatZodError.js';
import { createMulterFileSchema } from '../validation/schemas.js';

export function postMediaUpload(env: Env, client: S3Client): RequestHandler {
  const multerFileSchema = createMulterFileSchema(env.MEDIA_MAX_BYTES);
  return async (req, res, next) => {
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
  };
}
