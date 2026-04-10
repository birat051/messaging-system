import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express from 'express';
import { pinoHttp, stdSerializers } from 'pino-http';
import type { Env } from './config/env.js';
import { logger, safeErrorSerializer } from './logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { createGlobalRestRateLimitMiddleware } from './middleware/globalRestRateLimit.js';
import { createJsonBodyParserWithPublicKeyLimit } from './middleware/jsonBodyParserWithPublicKeyLimit.js';
import { notFoundHandler } from './middleware/notFound.js';
import { createAuthRouter } from './routes/auth.js';
import { createMessagesRouter } from './routes/messages.js';
import { createMediaRouter } from './routes/media.js';
import { systemRouter } from './routes/system.js';
import { createUsersRouter } from './routes/users.js';
import { createSwaggerUiHandlers } from './swagger.js';

export function createApp(env: Env): express.Application {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(createJsonBodyParserWithPublicKeyLimit(env));

  app.use(
    pinoHttp({
      logger,
      wrapSerializers: false,
      serializers: {
        req: stdSerializers.req,
        res: stdSerializers.res,
        err: safeErrorSerializer,
      },
      genReqId: (req: IncomingMessage, res: ServerResponse) => {
        const raw =
          req.headers['x-request-id'] ?? req.headers['x-correlation-id'];
        const id =
          typeof raw === 'string' && raw.trim() !== ''
            ? raw.trim()
            : randomUUID();
        const s = String(id);
        res.setHeader('x-request-id', s);
        res.setHeader('x-correlation-id', s);
        return id;
      },
      customProps: (req: IncomingMessage) => ({
        correlationId: req.id,
      }),
      autoLogging: {
        ignore: (req: IncomingMessage) => {
          const url = req.url ?? '';
          return (
            url.startsWith('/v1/health') ||
            url.startsWith('/v1/ready') ||
            url.startsWith('/api-docs')
          );
        },
      },
    }),
  );

  app.use('/v1', createGlobalRestRateLimitMiddleware(env));
  app.use('/v1', systemRouter);
  app.use('/v1', createAuthRouter(env));
  app.use('/v1', createUsersRouter(env));
  app.use('/v1', createMessagesRouter(env));

  if (env.S3_BUCKET) {
    app.use('/v1', createMediaRouter(env));
  }

  const swaggerHandlers = createSwaggerUiHandlers(env);
  if (swaggerHandlers) {
    app.use('/api-docs', ...swaggerHandlers);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
