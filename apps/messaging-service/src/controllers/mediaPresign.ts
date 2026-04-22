import type { RequestHandler } from 'express';
import type { Env } from '../config/env.js';
import {
  defaultUploadFilenameForContentType,
  presignPutUserMedia,
} from '../data/storage/presignUserMediaUpload.js';
import { AppError } from '../utils/errors/AppError.js';
import { formatZodError } from '../validation/formatZodError.js';
import {
  createMediaPresignRequestSchema,
  type MediaPresignRequestInput,
} from '../validation/schemas.js';

function parsePresignPayload(
  env: Env,
  raw: unknown,
): MediaPresignRequestInput {
  const schema = createMediaPresignRequestSchema(env.MEDIA_MAX_BYTES);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      'INVALID_REQUEST',
      400,
      formatZodError(parsed.error),
      parsed.error,
    );
  }
  return parsed.data;
}

function toPresignInput(data: MediaPresignRequestInput): {
  contentType: MediaPresignRequestInput['contentType'];
  contentLength: number;
  filename: string;
} {
  const filename =
    data.filename ?? defaultUploadFilenameForContentType(data.contentType);
  return {
    contentType: data.contentType,
    contentLength: data.contentLength,
    filename,
  };
}

/** **`POST /v1/media/presign`** — JSON body: **`contentType`**, **`contentLength`**, optional **`filename`**. */
export function postMediaPresign(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.authUser;
      if (!user) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const data = parsePresignPayload(env, req.body);
      const out = await presignPutUserMedia(env, user.id, toPresignInput(data));
      res.status(200).json(out);
    } catch (err) {
      next(err);
    }
  };
}

/** **`GET /v1/media/presign`** — same parameters as query: **`contentType`**, **`contentLength`**, optional **`filename`**. */
export function getMediaPresign(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.authUser;
      if (!user) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const data = parsePresignPayload(env, {
        contentType: req.query.contentType,
        contentLength: req.query.contentLength,
        filename: req.query.filename,
      });
      const out = await presignPutUserMedia(env, user.id, toPresignInput(data));
      res.status(200).json(out);
    } catch (err) {
      next(err);
    }
  };
}
