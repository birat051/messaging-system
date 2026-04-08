import pino from 'pino';
import { loadEnv } from './config/env.js';

const env = loadEnv();

const level =
  env.LOG_LEVEL ?? (env.NODE_ENV === 'production' ? 'info' : 'debug');

/**
 * Root logger — JSON lines to stdout (PROJECT_GUIDELINES.md structured logging).
 */
export const logger = pino({
  level,
  base: { service: 'messaging-service' },
});
