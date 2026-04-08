/**
 * Env schema — document every variable in `docs/ENVIRONMENT.md` (Docker Compose / local).
 */
import { hostname } from 'node:os';
import { z } from 'zod';

const logLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: logLevelSchema.optional(),
  /** Connection string for the MongoDB deployment (pool is configured below). */
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/messaging'),
  /** Application database name (not the `admin` DB used for ping only). */
  MONGODB_DB_NAME: z.string().min(1).default('messaging'),
  MONGODB_MAX_POOL_SIZE: z.coerce.number().int().positive().max(500).default(10),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@127.0.0.1:5672'),
  /**
   * Unique per process (e.g. pod name). Used in RabbitMQ queue name so each replica has its own queue
   * while bindings share the same routing pattern (PROJECT_PLAN.md §3.2).
   */
  MESSAGING_INSTANCE_ID: z.string().min(1).default(hostname() || 'default'),
  /** Optional CORS origin for Socket.IO (omit for permissive dev; use `*` for any). */
  SOCKET_IO_CORS_ORIGIN: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  /**
   * TTL for `presence:lastSeen:{userId}` keys (seconds). Refreshed on each write.
   */
  LAST_SEEN_TTL_SECONDS: z.coerce.number().int().positive().max(31536000).default(604800),
  /**
   * When true, enable `@socket.io/redis-adapter` so multiple messaging-service instances share rooms/events.
   * Uses separate Redis pub/sub connections from the main client.
   */
  SOCKET_IO_REDIS_ADAPTER: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return false;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /**
   * Absolute path to `openapi.yaml` when not using the default repo layout
   * (e.g. Docker image with spec copied elsewhere). Default: `docs/openapi/openapi.yaml` relative to monorepo root.
   */
  OPENAPI_SPEC_PATH: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * Validates `process.env` once at startup. Exits the process on failure (PROJECT_GUIDELINES.md).
 */
export function loadEnv(): Env {
  if (cached) {
    return cached;
  }
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
