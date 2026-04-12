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
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3000),
  LOG_LEVEL: logLevelSchema.optional(),
  /** Connection string for the MongoDB deployment (pool is configured below). */
  MONGODB_URI: z.string().min(1).default('mongodb://127.0.0.1:27017/messaging'),
  /** Application database name (not the `admin` DB used for ping only). */
  MONGODB_DB_NAME: z.string().min(1).default('messaging'),
  MONGODB_MAX_POOL_SIZE: z.coerce
    .number()
    .int()
    .positive()
    .max(500)
    .default(10),
  RABBITMQ_URL: z.string().min(1).default('amqp://guest:guest@127.0.0.1:5672'),
  /**
   * Unique per process (e.g. pod name). Used in RabbitMQ queue name so each replica has its own queue
   * while bindings share the same routing pattern (PROJECT_PLAN.md §3.2).
   */
  MESSAGING_INSTANCE_ID: z
    .string()
    .min(1)
    .default(hostname() || 'default'),
  /** Optional CORS origin for Socket.IO (omit for permissive dev; use `*` for any). */
  SOCKET_IO_CORS_ORIGIN: z.string().min(1).optional(),
  REDIS_URL: z.string().min(1).default('redis://127.0.0.1:6379'),
  /**
   * TTL for `presence:lastSeen:{userId}` keys (seconds). Refreshed on each write.
   */
  LAST_SEEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(31536000)
    .default(604800),
  /**
   * When true, enable `@socket.io/redis-adapter` (separate Redis pub/sub from the main client).
   * **Discouraged** for room fan-out: rooms are in-memory per process; cross-node delivery uses RabbitMQ + local `io.to(room).emit` (`PROJECT_PLAN.md` §3.2.2). Prefer leaving this off.
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

  /** When set, media uploads and S3 readiness are enabled. Omit to run without object storage (dev). */
  S3_BUCKET: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  /** MinIO / S3-compatible API base URL, e.g. `http://127.0.0.1:9000` or `http://minio:9000` in Compose. */
  S3_ENDPOINT: z.string().url().optional(),
  /** Path-style addressing; MinIO / custom endpoints need `true` (set automatically when `S3_ENDPOINT` is set in the S3 client factory). */
  S3_FORCE_PATH_STYLE: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /** Optional prefix for object keys, e.g. `messaging` → `messaging/users/...` */
  S3_KEY_PREFIX: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  /**
   * Public base URL for browser-visible object URLs (no trailing slash), e.g. `http://localhost:9000`.
   * If unset, `MediaUploadResponse.url` is null.
   */
  S3_PUBLIC_BASE_URL: z.string().url().optional(),
  /**
   * Max upload size in bytes per multipart `file` (images and videos). Default **30 MiB**; override via env for deployments that need a different cap.
   */
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(524288000)
    .default(31457280),
  /** HS256 secret for JWTs (media upload auth, access tokens, email verification tokens). */
  JWT_SECRET: z.string().min(1).optional(),
  /**
   * When `true`, new users start with `emailVerified: false` and must use verify/resend flows.
   * When `false` (default), registration sets `emailVerified: true` immediately (demo / no outbound mail).
   */
  EMAIL_VERIFICATION_REQUIRED: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return false;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /**
   * Default until **`system_config`** in MongoDB defines **`guestSessionsEnabled`**.
   * When **`false`**, **`POST /auth/guest`** must be rejected once that route exists (**Feature 2a**).
   */
  GUEST_SESSIONS_ENABLED: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return true;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /** Lifetime of signed email-verification JWTs (hours). */
  EMAIL_VERIFICATION_TOKEN_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .max(168)
    .default(48),
  /** Access token TTL after register/login (seconds). */
  ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(86400)
    .default(3600),
  /** Redis fixed-window rate limit: `POST /auth/register` per client IP. */
  REGISTER_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  REGISTER_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  /** Rate limit: `POST /auth/resend-verification` per normalized email hash. */
  RESEND_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  RESEND_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(3),
  /** Rate limit: `POST /auth/verify-email` per client IP (token attempts). */
  VERIFY_EMAIL_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  VERIFY_EMAIL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),

  /** SendGrid API key. When unset, verification emails are not sent (log only). */
  SENDGRID_API_KEY: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().min(1).optional(),
  ),
  /** From address (verified in SendGrid). Example: `noreply@example.com` or `Name <noreply@example.com>`. */
  EMAIL_FROM: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().min(1).optional(),
  ),
  /**
   * Public web origin for verification links (no trailing slash), e.g. `https://app.example.com`.
   * Required to build the link in outbound mail when using SendGrid.
   */
  PUBLIC_APP_BASE_URL: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().url().optional(),
  ),
  /** Path on the web app for the page that reads `token` and calls `POST /auth/verify-email`. */
  EMAIL_VERIFICATION_WEB_PATH: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().min(1).default('/verify-email'),
  ),
  /** Opaque refresh token lifetime in Redis (seconds). */
  REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(31536000)
    .default(604800),
  /** Signed password-reset JWT lifetime (hours). */
  PASSWORD_RESET_TOKEN_TTL_HOURS: z.coerce
    .number()
    .int()
    .positive()
    .max(168)
    .default(1),
  /** Web path for password reset page (`token` query → `POST /auth/reset-password`). */
  PASSWORD_RESET_WEB_PATH: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().min(1).default('/reset-password'),
  ),
  /** Rate limit: `POST /auth/forgot-password` per client IP. */
  FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  FORGOT_PASSWORD_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  /** Rate limit: `GET /users/search` per client IP (Redis). */
  USER_SEARCH_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  USER_SEARCH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  /**
   * When **`true`**, **`GET /users/{userId}/public-key`** (other than self) requires an existing **direct**
   * conversation between caller and target. When **`false`** (default), any authenticated user may
   * fetch a registered user's key (matches “may start a DM” / first encrypted message before a thread row).
   */
  PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return false;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /**
   * Redis fixed-window rate limit: **`PUT /users/me/public-key`** and **`POST /users/me/public-key/rotate`**
   * combined per **authenticated user id** (not IP).
   */
  PUBLIC_KEY_UPDATE_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  PUBLIC_KEY_UPDATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  /**
   * Max JSON body size (bytes) for **`PUT /users/me/public-key`** and **`POST /users/me/public-key/rotate`** —
   * stricter than the global **`1mb`** parser so directory updates cannot send large blobs.
   */
  PUBLIC_KEY_JSON_BODY_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(65536)
    .default(8192),
  /**
   * Fixed window for **`POST /messages`** and **`message:send`** (Redis) — **`user`** / **`IP`** / **`socket`**.
   */
  MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  MESSAGE_SEND_RATE_LIMIT_MAX_PER_IP: z.coerce
    .number()
    .int()
    .positive()
    .default(360),
  /** Used only for Socket.IO **`message:send`** (per **`socket.id`**). */
  MESSAGE_SEND_RATE_LIMIT_MAX_PER_SOCKET: z.coerce
    .number()
    .int()
    .positive()
    .default(120),
  /**
   * Fixed window for Socket.IO receipt events (**`message:delivered`**, **`message:read`**, **`conversation:read`**).
   */
  MESSAGE_RECEIPT_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
  MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_IP: z.coerce
    .number()
    .int()
    .positive()
    .default(2000),
  MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_SOCKET: z.coerce
    .number()
    .int()
    .positive()
    .default(600),
  /**
   * Global per-client-IP cap for REST **`/v1/*`** (middleware — **`docs/GLOBAL_RATE_LIMIT.md`**).
   * Default **500** requests per **60** seconds ≈ **500/min** average; not calendar-aligned.
   * **Stacks** with route-specific limits (**`REGISTER_*`**, **`USER_SEARCH_*`**, **`MESSAGE_SEND_*`**, …) — **`docs/ENVIRONMENT.md`**.
   */
  GLOBAL_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  GLOBAL_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(500),
});

const envSchemaRefined = envSchema.superRefine((data, ctx) => {
  if (!data.S3_BUCKET) {
    return;
  }
  if (data.S3_ENDPOINT) {
    if (!data.AWS_ACCESS_KEY_ID?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'AWS_ACCESS_KEY_ID is required when S3_ENDPOINT is set (MinIO / S3-compatible)',
        path: ['AWS_ACCESS_KEY_ID'],
      });
    }
    if (!data.AWS_SECRET_ACCESS_KEY?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'AWS_SECRET_ACCESS_KEY is required when S3_ENDPOINT is set',
        path: ['AWS_SECRET_ACCESS_KEY'],
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/** Clears the env cache so the next `loadEnv()` re-reads `process.env` (integration tests only). */
export function resetEnvCacheForTests(): void {
  cached = null;
}

/**
 * Validates `process.env` once at startup. Exits the process on failure (PROJECT_GUIDELINES.md).
 */
export function loadEnv(): Env {
  if (cached) {
    return cached;
  }
  const parsed = envSchemaRefined.safeParse(process.env);
  if (!parsed.success) {
    console.error(
      'Invalid environment variables:',
      parsed.error.flatten().fieldErrors,
    );
    process.exit(1);
  }
  cached = parsed.data;
  return cached;
}
