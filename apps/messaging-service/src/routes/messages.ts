/**
 * REST **`POST /v1/messages`** — **wiring only**. Handlers live in **`src/controllers/messages.ts`**.
 *
 * **Primary send path:** Socket.IO **`message:send`** (see **`src/utils/realtime/socket.ts`**) with the same
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
import type { Env } from '../config/env.js';
import {
  messageSendRateLimitPreBody,
  postMessage,
} from '../controllers/messages.js';
import { requireAuthMiddleware } from '../middleware/requireAuth.js';
import { validateBody } from '../validation/middleware.js';
import { sendMessageRequestSchema } from '../validation/schemas.js';

export function createMessagesRouter(env: Env): Router {
  const router = Router();

  router.post(
    '/messages',
    requireAuthMiddleware(env),
    messageSendRateLimitPreBody(env),
    validateBody(sendMessageRequestSchema),
    postMessage(),
  );

  return router;
}
