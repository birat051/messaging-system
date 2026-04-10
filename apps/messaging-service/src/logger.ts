import pino from 'pino';
import { loadEnv } from './config/env.js';

const env = loadEnv();

const level =
  env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Safe for **pino-http** and manual logs — does **not** serialize **`Error.cause`**, Zod **`issues`**
 * (which can echo request fields), or other enumerable props that may contain key material.
 */
export function safeErrorSerializer(err: unknown): {
  type: string;
  message: string;
  stack?: string;
} {
  if (!err || typeof err !== 'object') {
    return { type: 'NonError', message: String(err) };
  }
  const e = err as Error;
  return {
    type: e.constructor?.name ?? 'Error',
    message: e.message,
    stack: e.stack,
  };
}

/**
 * Root logger — JSON lines to stdout (PROJECT_GUIDELINES.md structured logging).
 */
export const logger = pino({
  level,
  base: { service: 'messaging-service' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
    ],
    remove: true,
  },
  serializers: {
    err: safeErrorSerializer,
  },
});
