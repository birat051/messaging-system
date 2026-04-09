# Environment variables

Single reference for variables passed into each deployable (Docker Compose, local runs, CI). **Do not commit secrets.** Update this file when you add or rename variables in code.

| Service | Code / config entry |
|---------|---------------------|
| **messaging-service** | `apps/messaging-service/src/config/env.ts` (extend schema as features land) |
| **web-client** | Vite: `import.meta.env.VITE_*` (see `apps/web-client` when scaffolded) |

---

## messaging-service

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `3000` | HTTP listen port |
| `LOG_LEVEL` | no | `info` in production, else `debug` | Pino level: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` |
| `MONGODB_URI` | no | `mongodb://127.0.0.1:27017/messaging` | MongoDB connection string (driver uses a pooled client; tune with `MONGODB_MAX_POOL_SIZE`) |
| `MONGODB_DB_NAME` | no | `messaging` | Default database name for application data (`getDb()` in `apps/messaging-service/src/db/mongo.ts`) |
| `MONGODB_MAX_POOL_SIZE` | no | `10` | Max connections in the MongoDB driver pool |
| `RABBITMQ_URL` | no | `amqp://guest:guest@127.0.0.1:5672` | RabbitMQ connection URL (`amqplib`) |
| `MESSAGING_INSTANCE_ID` | no | host name | Unique per process/replica; used in RabbitMQ queue name (`messaging.node.<id>`) |
| `SOCKET_IO_CORS_ORIGIN` | no | — | Optional Socket.IO CORS origin string; omit for permissive defaults in dev; use `*` for any |
| `REDIS_URL` | no | `redis://127.0.0.1:6379` | Redis connection URL (last seen, rate limits, optional **Socket.IO Redis adapter** for multi-node) |
| `LAST_SEEN_TTL_SECONDS` | no | `604800` | TTL (seconds) for Redis keys `presence:lastSeen:{userId}`; refreshed on each presence write |
| `SOCKET_IO_REDIS_ADAPTER` | no | `false` | Set `true` / `1` to enable **`@socket.io/redis-adapter`** (separate Redis pub/sub connections) for multiple **messaging-service** replicas |
| `OPENAPI_SPEC_PATH` | no | — | Absolute path to **`openapi.yaml`** when the default resolution fails (e.g. minimal Docker image without monorepo `docs/`). Default: resolve `docs/openapi/openapi.yaml` three levels above `dist/` / `src/` (see `apps/messaging-service/src/swagger.ts`). |
| `S3_BUCKET` | no | — | When set, enables **`POST /v1/media/upload`**, S3 readiness, and startup **`ensureBucketExists`**. Omit to run without object storage. |
| `S3_REGION` | no | `us-east-1` | AWS region (also used for MinIO client config). |
| `S3_ENDPOINT` | no | — | S3-compatible API URL (e.g. `http://127.0.0.1:9000` or `http://minio:9000` in Docker). When set, **`AWS_ACCESS_KEY_ID`** and **`AWS_SECRET_ACCESS_KEY`** are required. |
| `S3_FORCE_PATH_STYLE` | no | `false` | Path-style URLs; set `true` for some S3-compatible stores. With **`S3_ENDPOINT`**, the client forces path-style automatically when needed. |
| `S3_KEY_PREFIX` | no | — | Optional prefix for object keys (e.g. `messaging`). |
| `AWS_ACCESS_KEY_ID` | with `S3_ENDPOINT` | — | Access key (MinIO: match **`MINIO_ROOT_USER`** in dev). |
| `AWS_SECRET_ACCESS_KEY` | with `S3_ENDPOINT` | — | Secret key (MinIO: match **`MINIO_ROOT_PASSWORD`**). |
| `S3_PUBLIC_BASE_URL` | no | — | No trailing slash — used to build optional **`url`** in **`MediaUploadResponse`** (e.g. `http://localhost:9000` for local MinIO from the host browser). |
| `MEDIA_MAX_BYTES` | no | `31457280` | Max **`multipart`** `file` size per upload (**30 MiB** default for image/video). Upper bound in validation: **500 MiB**. |
| `JWT_SECRET` | no | — | **Required** for **`POST /auth/register`**, **`/auth/verify-email`**, **`/auth/resend-verification`** (HS256 signing). Also used for **`POST /v1/media/upload`** when Bearer auth is enabled. When unset, **`X-User-Id`** dev upload header only applies in non-production. |
| `EMAIL_VERIFICATION_REQUIRED` | no | `false` | When **`true`**, **`POST /auth/register`** sets **`emailVerified: false`** and verification JWT / mail flow applies. When **`false`** (default), new users get **`emailVerified: true`** immediately (no verification email). **`POST /auth/verify-email`** and **`POST /auth/resend-verification`** return **400** with code **`EMAIL_VERIFICATION_DISABLED`** — not used on the happy path when verification is off. |
| `EMAIL_VERIFICATION_TOKEN_TTL_HOURS` | no | `48` | Lifetime of signed email-verification JWTs. |
| `ACCESS_TOKEN_TTL_SECONDS` | no | `3600` | Access token TTL on **`POST /auth/register`**, **`/auth/login`**, **`/auth/refresh`**, **`/auth/verify-email`**. |
| `REFRESH_TOKEN_TTL_SECONDS` | no | `604800` | Opaque refresh token TTL in **Redis** (default **7 days**). |
| `PASSWORD_RESET_TOKEN_TTL_HOURS` | no | `1` | Signed JWT for **`POST /auth/reset-password`**. |
| `PASSWORD_RESET_WEB_PATH` | no | `/reset-password` | Web path for reset link (`{PUBLIC_APP_BASE_URL}{path}?token=...`). |
| `FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SEC` | no | `3600` | Fixed window for **`POST /auth/forgot-password`** per client IP. |
| `FORGOT_PASSWORD_RATE_LIMIT_MAX` | no | `5` | Max forgot-password requests per IP per window. |
| `REGISTER_RATE_LIMIT_WINDOW_SEC` | no | `3600` | Fixed window for **`POST /auth/register`** per client IP (Redis). |
| `REGISTER_RATE_LIMIT_MAX` | no | `5` | Max registrations per IP per window. |
| `RESEND_RATE_LIMIT_WINDOW_SEC` | no | `3600` | Fixed window for **`POST /auth/resend-verification`** per normalized email (Redis). |
| `RESEND_RATE_LIMIT_MAX` | no | `3` | Max resends per email per window. |
| `VERIFY_EMAIL_RATE_LIMIT_WINDOW_SEC` | no | `3600` | Window for **`POST /auth/verify-email`** per client IP. |
| `VERIFY_EMAIL_RATE_LIMIT_MAX` | no | `30` | Max verify attempts per IP per window. |
| `SENDGRID_API_KEY` | no | — | When **`EMAIL_VERIFICATION_REQUIRED`** is **`true`**, used to send verification mail. If unset, **`sendVerificationEmail`** logs a warning and skips send (registration still succeeds). |
| `EMAIL_FROM` | with SendGrid sends | — | Verified sender in SendGrid (e.g. `noreply@yourdomain.com` or `App Name <noreply@yourdomain.com>`). |
| `PUBLIC_APP_BASE_URL` | with SendGrid sends | — | Web app origin **without** trailing slash (e.g. `https://app.example.com`). Verification links are **`{PUBLIC_APP_BASE_URL}{EMAIL_VERIFICATION_WEB_PATH}?token=...`**. |
| `EMAIL_VERIFICATION_WEB_PATH` | no | `/verify-email` | Path on the web client for the page that reads **`token`** and calls **`POST /v1/auth/verify-email`**. |

*Future:* separate signing keys for access vs refresh — extend here and `loadEnv()` in the same PR.

---

## web-client

Env files live under **`apps/web-client/`**. **Committed:** **`.env.development`** (dev server) and **`.env.production`** (production build). Optional **`.env.development.local`** / **`.env.production.local`** override those per machine and are **gitignored** (see root **`.gitignore`** and **`apps/web-client/.gitignore`**).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | no | *(relative)* `/v1` on current origin in dev | REST base URL **including** `/v1`, or a path (`/v1`) when using **Vite** `server.proxy` to nginx (**`8080`**). Absolute example: `http://localhost:8080/v1`. |

**Tokens (browser):** access JWT is **in memory** (Redux); refresh token is **`localStorage`** key **`messaging-refresh-token`**. **`POST /v1/auth/refresh`** on **401** (up to **3** attempts, **1s** between failures, then redirect to **`/login`**) — see **`apps/web-client/src/api/httpClient.ts`**.

---

## Docker Compose

The stack is defined in **[`../infra/docker-compose.yml`](../infra/docker-compose.yml)** (run from repo root: `docker compose -f infra/docker-compose.yml up -d`). **messaging-service** receives:

- `MONGODB_URI=mongodb://mongo:27017/messaging`
- `REDIS_URL=redis://redis:6379`
- `RABBITMQ_URL=amqp://messaging:messaging@rabbitmq:5672` (override user/pass via **`infra/.env.example`** → `.env`)

**`OPENAPI_SPEC_PATH`** is set in the image to `/app/openapi/openapi.yaml` (baked in at build time).

**S3 / MinIO (media uploads):** **`infra/docker-compose.yml`** sets **`S3_BUCKET`**, **`S3_ENDPOINT=http://minio:9000`**, credentials from **`MINIO_ROOT_*`**, **`S3_PUBLIC_BASE_URL`**, and **`JWT_SECRET`** for **`POST /v1/media/upload`**. Override via **`.env`** next to Compose.

Optional variable substitution for Compose: copy **`infra/.env.example`** patterns to a **`.env`** next to where you run `docker compose` (see root **`README.md`**).

Keep **TLS / production** notes in [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) §13 and tasks in [`TASK_CHECKLIST.md`](./TASK_CHECKLIST.md).
