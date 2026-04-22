import { Router } from 'express';
import multer from 'multer';
import type { Env } from '../config/env.js';
import { getMediaPresign, postMediaPresign } from '../controllers/mediaPresign.js';
import { postMediaUpload } from '../controllers/media.js';
import { requireAuthMiddleware } from '../middleware/requireAuth.js';
import { requireUploadAuth } from '../middleware/uploadAuth.js';
import { getS3Client } from '../data/storage/s3Client.js';
import { AppError } from '../utils/errors/AppError.js';

/** **`POST /media/upload`** — **wiring only** (multer + auth). Handler in **`src/controllers/media.ts`**. */
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

  router.post(
    '/media/presign',
    requireAuthMiddleware(env),
    postMediaPresign(env),
  );
  router.get(
    '/media/presign',
    requireAuthMiddleware(env),
    getMediaPresign(env),
  );

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
    postMediaUpload(env, client),
  );

  return router;
}
