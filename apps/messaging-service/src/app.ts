import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import express from 'express';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env.js';
import { logger } from './logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFound.js';
import { createAuthRouter } from './routes/auth.js';
import { createMediaRouter } from './routes/media.js';
import { systemRouter } from './routes/system.js';
import { createSwaggerUiHandlers } from './swagger.js';

export function createApp(env: Env): express.Application {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '1mb' }));

  app.use(
    pinoHttp({
      logger,
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
        ignore: (req) => {
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

  app.use('/v1', systemRouter);
  app.use('/v1', createAuthRouter(env));

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
