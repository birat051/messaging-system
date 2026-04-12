import type { RequestHandler } from 'express';
import { AppError } from '../utils/errors/AppError.js';
import { listConversationsForUser } from '../data/conversations/listConversationsForUser.js';
import { listMessageReceiptsForParticipant } from '../data/messages/listMessageReceipts.js';
import { listMessagesForParticipant } from '../data/messages/listMessages.js';
import { resolveListLimit } from '../validation/limitQuery.js';
import type { PaginationQuery } from '../validation/schemas.js';

export function getConversationsList(): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.authUser;
      if (!user) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const q = req.query as PaginationQuery;
      const effectiveLimit = resolveListLimit(q.limit);
      const result = await listConversationsForUser({
        userId: user.id,
        cursor: q.cursor,
        limit: effectiveLimit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

export function getConversationMessages(): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.authUser;
      if (!user) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const { conversationId } = req.params as {
        conversationId: string;
      };
      const q = req.query as PaginationQuery;
      const effectiveLimit = resolveListLimit(q.limit);
      const result = await listMessagesForParticipant({
        userId: user.id,
        conversationId,
        cursor: q.cursor,
        limit: effectiveLimit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}

export function getConversationMessageReceipts(): RequestHandler {
  return async (req, res, next) => {
    try {
      const user = req.authUser;
      if (!user) {
        next(new AppError('UNAUTHORIZED', 401, 'Authentication required'));
        return;
      }
      const { conversationId } = req.params as {
        conversationId: string;
      };
      const q = req.query as PaginationQuery;
      const effectiveLimit = resolveListLimit(q.limit);
      const result = await listMessageReceiptsForParticipant({
        userId: user.id,
        conversationId,
        cursor: q.cursor,
        limit: effectiveLimit,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };
}
