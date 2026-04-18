import type { RequestHandler } from 'express';
import { getClientIp } from '../utils/auth/getClientIp.js';
import type { Env } from '../config/env.js';
import { AppError } from '../utils/errors/AppError.js';
import { messageDocumentToApi } from '../data/messages/messageApiShape.js';
import { isMessageSendRateLimited } from '../data/messages/messageSendRateLimit.js';
import { sendMessageForUser } from '../data/messages/sendMessage.js';
import type { SendMessageRequest } from '../validation/schemas.js';

/**
 * Rate-limit gate for deprecated **`POST /messages`** (same policy as Socket.IO **`message:send`**).
 */
export function messageSendRateLimitPreBody(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.authUser;
      if (!user) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const ip = getClientIp(req);
      if (
        await isMessageSendRateLimited(env, {
          userId: user.id,
          ip,
          isGuest: user.isGuest === true,
        })
      ) {
        next(
          new AppError(
            'RATE_LIMIT_EXCEEDED',
            429,
            'Too many message send requests; try again later',
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

export function postMessage(env: Env): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.authUser;
      if (!user) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const payload = req.body as SendMessageRequest;
      const msg = await sendMessageForUser(env, user.id, payload);
      res.status(201).json(messageDocumentToApi(msg));
    } catch (err) {
      next(err);
    }
  };
}
