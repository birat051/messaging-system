/**
 * Env schema — document every variable in `apps/messaging-service/.env.example` (Docker Compose / local).
 */
import { hostname } from 'node:os';
import { z } from 'zod';
import {
  DEFAULT_USER_SEARCH_MAX_CANDIDATE_SCAN,
  DEFAULT_USER_SEARCH_MIN_QUERY_LENGTH,
} from './userSearchPolicy.js';

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
  /**
   * When `true`, expose **GET /metrics** (Prometheus text) with Node default + app HTTP/Socket.IO metrics.
   * Binds in-process only — restrict by firewall or bind address; not for public internet as-is.
   */
  ENABLE_PROMETHEUS_METRICS: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return false;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
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
  /**
   * When true, logs structured fields for each RabbitMQ → Socket.IO **`message:new`** / receipt emit
   * (routing key, **`user:<id>`** room, message id, conversation id, recipient user id, **`skipSocketId`** if any).
   */
  MESSAGING_REALTIME_DELIVERY_LOGS: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return false;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /** Optional CORS origin for Socket.IO (omit for permissive dev; use `*` for any). */
  SOCKET_IO_CORS_ORIGIN: z.string().min(1).optional(),
  /**
   * Allowed **`Origin`** header values for **`cors`** on Express REST (**`/v1/*`**, Swagger, **`/metrics`** when enabled).
   * **`*`** = wildcard (**`Access-Control-Allow-Origin: *`**); comma-separated list allows multiple origins. When unset / empty → **`*`**.
   */
  REST_CORS_ALLOWED_ORIGINS: z.preprocess((val) => {
    if (val === undefined || val === null || String(val).trim() === '') {
      return '*';
    }
    return String(val).trim();
  }, z.string().min(1)),
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
  /**
   * **Cloudflare R2** account id (32 hex chars from the dashboard). **Server-side only** — never expose in the web client.
   * When **`S3_ENDPOINT`** is unset, the default endpoint is **`https://<id>.r2.cloudflarestorage.com`** (S3-compatible API).
   * Pair with **`S3_BUCKET`** and an R2 **API token** mapped to **`AWS_ACCESS_KEY_ID`** / **`AWS_SECRET_ACCESS_KEY`**.
   */
  CLOUDFLARE_R2_ACCOUNT_ID: z.preprocess(
    (v) => (v === '' || v === undefined ? undefined : v),
    z.string().regex(/^[a-fA-F0-9]{32}$/).optional(),
  ),
  S3_REGION: z.string().min(1).default('us-east-1'),
  /**
   * MinIO / S3-compatible API base URL, e.g. `http://127.0.0.1:9000` or **`https://<accountid>.r2.cloudflarestorage.com`** for R2.
   * If omitted and **`CLOUDFLARE_R2_ACCOUNT_ID`** is set, defaults to the R2 endpoint above.
   */
  S3_ENDPOINT: z.preprocess((val) => {
    if (val !== undefined && val !== null && String(val).trim() !== '') {
      return val;
    }
    const id = process.env.CLOUDFLARE_R2_ACCOUNT_ID?.trim();
    if (id && /^[a-fA-F0-9]{32}$/.test(id)) {
      return `https://${id}.r2.cloudflarestorage.com`;
    }
    return undefined;
  }, z.string().url().optional()),
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
   * S3-compatible API base URL used **only** when signing pre-signed **`PUT`** URLs for direct browser uploads.
   * Server-side **`S3_ENDPOINT`** may be an internal hostname (e.g. **`http://minio:9000`** in Docker) that the browser
   * cannot resolve — in that case set **`S3_PUBLIC_BASE_URL`** to the host the browser uses (often **`http://localhost:9000`**),
   * or set this variable to override when presign must target a different API origin than **`S3_PUBLIC_BASE_URL`**.
   */
  S3_PRESIGN_ENDPOINT: z.string().url().optional(),
  /**
   * When `true`, apply an **anonymous `s3:GetObject`** bucket policy on startup so browser **`img src`** URLs
   * (see **`S3_PUBLIC_BASE_URL`**) work against **MinIO** / private S3 buckets. **Do not** enable on AWS public
   * buckets meant to stay private behind CloudFront/OAI — use **`false`** (default) there.
   */
  S3_ANONYMOUS_GET_OBJECT: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return false;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /**
   * Max upload size in bytes per multipart `file` (images and videos) and max **`contentLength`** for **`/v1/media/presign`**.
   * Default **100 MiB** — matches **`VITE_MEDIA_UPLOAD_MAX_BYTES`** on web-client; lower or raise per deployment.
   */
  MEDIA_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(524288000)
    .default(104857600),
  /**
   * Lifetime (seconds) for **`GET`/`POST /v1/media/presign`** — pre-signed **`PUT`** URLs for direct browser uploads.
   * Short default (**5 min**); max **1 h**.
   */
  MEDIA_PRESIGN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .min(60)
    .max(3600)
    .default(300),
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
  /**
   * Guest access JWT lifetime (seconds). Used for **`POST /auth/guest`** and **`POST /auth/refresh`** when the user is a guest.
   * Default **30 minutes**; independent of **`ACCESS_TOKEN_TTL_SECONDS`** / **`REFRESH_TOKEN_TTL_SECONDS`**.
   */
  GUEST_ACCESS_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(86400)
    .default(1800),
  /**
   * Guest opaque refresh token TTL in Redis (seconds). Should align with **`GUEST_ACCESS_TOKEN_TTL_SECONDS`** for the guest sandbox.
   * Default **30 minutes**.
   */
  GUEST_REFRESH_TOKEN_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(86400)
    .default(1800),
  /**
   * When **`true`** (default), guest **`users`** / guest-only **conversations** / **messages** may carry **`guestDataExpiresAt`**
   * for MongoDB TTL cleanup. Override via **`system_config.guestDataTtlEnabled`**.
   */
  GUEST_DATA_TTL_ENABLED: z.preprocess((val) => {
    if (val === undefined || val === '') {
      return true;
    }
    if (val === false || val === 0 || val === '0' || val === 'false') {
      return false;
    }
    return val === true || val === 'true' || val === '1' || val === 1;
  }, z.boolean()),
  /**
   * Horizon (seconds) from insert for **`guestDataExpiresAt`** on guest rows when TTL is enabled.
   * Default **24 hours**; cap aligns with MongoDB TTL expectations.
   */
  GUEST_DATA_MONGODB_TTL_SECONDS: z.coerce
    .number()
    .int()
    .positive()
    .max(2592000)
    .default(86400),
  /**
   * Redis fixed-window rate limit: **`POST /auth/guest`** per client IP (**`getClientIp`** / **`X-Forwarded-For`**).
   * Stacks with optional **`X-Client-Fingerprint`** bucket when that header is non-empty.
   */
  GUEST_AUTH_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  GUEST_AUTH_RATE_LIMIT_MAX_PER_IP: z.coerce
    .number()
    .int()
    .positive()
    .default(20),
  /**
   * Max guest creations per window when **`X-Client-Fingerprint`** is sent (hashed in Redis).
   * Ignored when the header is omitted.
   */
  GUEST_AUTH_RATE_LIMIT_MAX_PER_FINGERPRINT: z.coerce
    .number()
    .int()
    .positive()
    .default(10),
  /**
   * Per-**guest** **`userId`** cap for **`POST /messages`** and Socket.IO **`message:send`** (same window as
   * **`MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC`**). Registered users use **`MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER`**.
   */
  GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
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
    .default(86400),
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
   * Same window semantics as **`USER_SEARCH_RATE_LIMIT_WINDOW_SEC`** — used when the authenticated caller is a **guest**
   * (**`GET /users/search`** uses **`ratelimit:users-search:guest-ip:*`**).
   */
  GUEST_USER_SEARCH_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  /**
   * Stricter per-IP cap for **guest** callers on **`GET /users/search`** (default lower than **`USER_SEARCH_RATE_LIMIT_MAX`**).
   */
  GUEST_USER_SEARCH_RATE_LIMIT_MAX: z.coerce
    .number()
    .int()
    .positive()
    .default(30),
  /**
   * Minimum **`email`** query length for **`GET /users/search`** (substring match). Default **3** limits
   * very broad two-character scans; may be set to **2** only when you accept weaker abuse bounds.
   */
  USER_SEARCH_MIN_QUERY_LENGTH: z.coerce
    .number()
    .int()
    .min(2)
    .max(254)
    .default(DEFAULT_USER_SEARCH_MIN_QUERY_LENGTH),
  /**
   * Max MongoDB documents read for one search (regex substring on **`users.email`**). Caps work per
   * request regardless of **`limit`** (response size is still capped by **`limit`**).
   */
  USER_SEARCH_MAX_CANDIDATE_SCAN: z.coerce
    .number()
    .int()
    .min(1)
    .max(5000)
    .default(DEFAULT_USER_SEARCH_MAX_CANDIDATE_SCAN),
  /**
   * When **`true`**, **`GET /users/{userId}/devices/public-keys`** (other than self) requires an existing **direct**
   * conversation between caller and target. When **`false`** (default), any authenticated user may
   * fetch a registered user's device keys (matches “may start a DM” / first encrypted message before a thread row).
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
   * Redis fixed-window rate limit: **`POST /users/me/devices`**, **`DELETE /users/me/devices/:deviceId`**
   * combined per **authenticated user id** (not IP).
   */
  PUBLIC_KEY_UPDATE_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  PUBLIC_KEY_UPDATE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  /**
   * Redis fixed-window rate limit for **`POST /users/me/sync/message-keys`** (batch wrapped-key upload) per **user id**.
   * If unset, **`DEVICE_SYNC_BATCH_RATE_LIMIT_*`** legacy names are still read (same semantics).
   */
  DEVICE_SYNC_RATE_LIMIT_WINDOW_SEC: z.preprocess((val) => {
    if (val !== undefined && val !== '' && val !== null) return val;
    const legacy = process.env.DEVICE_SYNC_BATCH_RATE_LIMIT_WINDOW_SEC;
    if (legacy !== undefined && legacy !== '' && legacy !== null) return legacy;
    return undefined;
  }, z.coerce.number().int().positive().default(3600)),
  DEVICE_SYNC_RATE_LIMIT_MAX: z.preprocess((val) => {
    if (val !== undefined && val !== '' && val !== null) return val;
    const legacy = process.env.DEVICE_SYNC_BATCH_RATE_LIMIT_MAX;
    if (legacy !== undefined && legacy !== '' && legacy !== null) return legacy;
    return undefined;
  }, z.coerce.number().int().positive().default(120)),
  /**
   * Max JSON body size (bytes) for **`POST /users/me/sync/message-keys`** (batch of wrapped keys).
   */
  DEVICE_SYNC_BATCH_JSON_BODY_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .max(1048576)
    .default(524288),
  /**
   * Redis fixed-window rate limit for **`POST /users/me/devices/sync-notify`** (re-broadcast **`device:sync_requested`**)
   * per **authenticated user id**.
   */
  DEVICE_SYNC_NOTIFY_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(3600),
  DEVICE_SYNC_NOTIFY_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(60),
  /**
   * Max JSON body size (bytes) for **`POST /users/me/devices`** — stricter than the global **`1mb`** parser so
   * device registration payloads cannot send large blobs.
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
   * Fixed window for Socket.IO **WebRTC signaling** (**`webrtc:offer`**, **`webrtc:answer`**, **`webrtc:candidate`**, **`webrtc:hangup`**).
   */
  WEBRTC_SIGNAL_RATE_LIMIT_WINDOW_SEC: z.coerce
    .number()
    .int()
    .positive()
    .default(60),
  WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_USER: z.coerce
    .number()
    .int()
    .positive()
    .default(2000),
  WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_IP: z.coerce
    .number()
    .int()
    .positive()
    .default(6000),
  WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_SOCKET: z.coerce
    .number()
    .int()
    .positive()
    .default(2000),
  /**
   * Global per-client-IP cap for REST **`/v1/*`** (middleware — `apps/messaging-service/.env.example`).
   * Default **500** requests per **60** seconds ≈ **500/min** average; not calendar-aligned.
   * **Stacks** with route-specific limits (**`REGISTER_*`**, **`USER_SEARCH_*`**, **`MESSAGE_SEND_*`**, …).
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
 * Validates `process.env` once at startup. Exits the process on failure (`docs/PROJECT_PLAN.md` §14).
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
