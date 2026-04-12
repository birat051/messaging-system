import { Router } from 'express';
import type { Env } from '../config/env.js';
import {
  getConversationMessageReceipts,
  getConversationMessages,
  getConversationsList,
} from '../controllers/conversations.js';
import { requireAuthMiddleware } from '../middleware/requireAuth.js';
import { validateParams, validateQuery } from '../validation/middleware.js';
import {
  conversationIdPathSchema,
  paginationQuerySchema,
} from '../validation/schemas.js';

/**
 * **`GET /conversations`**, **`GET /conversations/:id/message-receipts`**, **`GET /conversations/:id/messages`** — **wiring only**.
 * Handlers in **`src/controllers/conversations.ts`**.
 */
export function createConversationsRouter(env: Env): Router {
  const router = Router();

  router.get(
    '/conversations',
    requireAuthMiddleware(env),
    validateQuery(paginationQuerySchema),
    getConversationsList(),
  );

  router.get(
    '/conversations/:conversationId/message-receipts',
    requireAuthMiddleware(env),
    validateParams(conversationIdPathSchema),
    validateQuery(paginationQuerySchema),
    getConversationMessageReceipts(),
  );

  router.get(
    '/conversations/:conversationId/messages',
    requireAuthMiddleware(env),
    validateParams(conversationIdPathSchema),
    validateQuery(paginationQuerySchema),
    getConversationMessages(),
  );

  return router;
}
