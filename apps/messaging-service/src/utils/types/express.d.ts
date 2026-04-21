import type { UserDocument } from '../../data/users/users.collection.js';

import 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireUploadAuth` for `POST /v1/media/upload`. */
      uploadUserId?: string;
      /** Set by `requireAuthMiddleware` / `requireUploadAuth` after DB load. */
      authUser?: UserDocument;
      /**
       * When the access JWT includes **`sourceDeviceId`** (device-bound session), set by **`requireAuthMiddleware`**.
       */
      authSourceDeviceId?: string;
    }
  }
}

export {};
