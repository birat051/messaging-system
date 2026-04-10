/**
 * REST **`POST /v1/messages`** — **deprecated** for interactive / production app traffic.
 *
 * **Primary send path:** Socket.IO **`message:send`** (see **`src/realtime/socket.ts`**) with the same
 * **`SendMessageRequest`** validation and **`sendMessageForUser`** persistence. This HTTP route stays
 * mounted for **integration tests**, **scripts**, **curl**, and **MSW**-style tooling that hit REST only.
 *
 * OpenAPI marks this operation **`deprecated: true`**; see **`docs/openapi/openapi.yaml`**.
 *
 * **Rate limits:** same Redis fixed-window policy as Socket.IO **`message:send`** (**`MESSAGE_SEND_RATE_LIMIT_*`**,
 * per **user** + **IP**; no per-connection dimension for stateless HTTP). REST **`POST`** also counts toward
 * **`GLOBAL_RATE_LIMIT_*`** (middleware + **`MESSAGE_SEND_*`** — **stack**).
 */
import { Router } from 'express';
import { getClientIp } from '../auth/getClientIp.js';
import type { Env } from '../config/env.js';
import { AppError } from '../errors/AppError.js';
import { messageDocumentToApi } from '../messages/messageApiShape.js';
import { isMessageSendRateLimited } from '../messages/messageSendRateLimit.js';
import { requireAuthMiddleware } from '../middleware/requireAuth.js';
import { sendMessageForUser } from '../messages/sendMessage.js';
import { validateBody } from '../validation/middleware.js';
import {
  sendMessageRequestSchema,
  type SendMessageRequest,
} from '../validation/schemas.js';

export function createMessagesRouter(env: Env): Router {
  const router = Router();

  router.post(
    '/messages',
    requireAuthMiddleware(env),
    async (req, res, next) => {
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
    },
    validateBody(sendMessageRequestSchema),
    async (req, res, next) => {
      try {
        const user = req.authUser;
        if (!user) {
          next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
          return;
        }
        const payload = req.body as SendMessageRequest;
        const msg = await sendMessageForUser(user.id, payload);
        res.status(201).json(messageDocumentToApi(msg));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
