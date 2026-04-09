import type { UserDocument } from '../users/types.js';

import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireUploadAuth` for `POST /v1/media/upload`. */
      uploadUserId?: string;
      /** Set by `requireAuthMiddleware` / `requireUploadAuth` after DB load. */
      authUser?: UserDocument;
    }
  }
}

export {};
