# Environment variables

Single reference for variables passed into each deployable (Docker Compose, local runs, CI). **Do not commit secrets.** Update this file when you add or rename variables in code.

| Service | Code / config entry |
|---------|---------------------|
| **messaging-service** | `apps/messaging-service/src/config/env.ts` (extend schema as features land) |
| **web-client** | Vite: `import.meta.env.VITE_*` (see `apps/web-client` when scaffolded) |

**E2EE / private keys:** Client-side key generation and **IndexedDB** persistence require a **secure context** (HTTPS or localhost). See **`docs/USER_KEYPAIR_AND_E2EE_DESIGN.md`** §2.1 — not controlled by env vars, but production must serve the SPA over HTTPS.

---

## messaging-service

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | no | `development` | `development` \| `production` \| `test` |
| `PORT` | no | `3000` | HTTP listen port |
| `LOG_LEVEL` | no | `info` in production, else `debug` | Pino level: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent` |
| `MONGODB_URI` | no | `mongodb://127.0.0.1:27017/messaging` | MongoDB connection string (driver uses a pooled client; tune with `MONGODB_MAX_POOL_SIZE`) |
| `MONGODB_DB_NAME` | no | `messaging` | Default database name for application data (`getDb()` in `apps/messaging-service/src/data/db/mongo.ts`) |
| `MONGODB_MAX_POOL_SIZE` | no | `10` | Max connections in the MongoDB driver pool |
| `RABBITMQ_URL` | no | `amqp://guest:guest@127.0.0.1:5672` | RabbitMQ connection URL (`amqplib`) |
| `MESSAGING_INSTANCE_ID` | no | host name | Unique per process/replica; used in RabbitMQ queue name (`messaging.node.<id>`) |
| `SOCKET_IO_CORS_ORIGIN` | no | — | Optional Socket.IO CORS origin string; omit for permissive defaults in dev; use `*` for any |
| `REDIS_URL` | no | `redis://127.0.0.1:6379` | Redis connection URL (last seen, rate limits, runtime config cache — **not** Socket.IO room state; see **`PROJECT_PLAN.md` §3.2.2**) |
| `LAST_SEEN_TTL_SECONDS` | no | `604800` | TTL (seconds) for Redis keys `presence:lastSeen:{userId}`; refreshed on each presence write |
| `SOCKET_IO_REDIS_ADAPTER` | no | `false` | **Discouraged.** Intended scaling uses **in-memory** Socket.IO rooms + **RabbitMQ** per replica (**`PROJECT_PLAN.md` §3.2.2**). Enabling **`@socket.io/redis-adapter`** can **duplicate** broker-driven delivery. Leave **`false`** unless a separate ops need is documented. |
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
| `EMAIL_VERIFICATION_REQUIRED` | no | `false` | See **[Email verification](#email-verification-email_verification_required)** and **[Runtime config (MongoDB)](#runtime-configuration-mongodb)** below. |
| `GUEST_SESSIONS_ENABLED` | no | `true` | Default until **`system_config.guestSessionsEnabled`** exists in MongoDB. When **`POST /auth/guest`** ships (**Feature 2a**), **`false`** rejects guest signup. |
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
| `USER_SEARCH_RATE_LIMIT_WINDOW_SEC` | no | `60` | Fixed window for **`GET /users/search`** per client IP (Redis). |
| `USER_SEARCH_RATE_LIMIT_MAX` | no | `60` | Max user search requests per IP per window. |
| `PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD` | no | `false` | When **`true`**, **`GET /users/{userId}/public-key`** (not self) requires an existing **direct** conversation between caller and target; when **`false`**, any authenticated user may fetch a registered user’s key (first DM / loose directory). |
| `PUBLIC_KEY_UPDATE_RATE_LIMIT_WINDOW_SEC` | no | `3600` | Fixed window for **`PUT /users/me/public-key`** and **`POST /users/me/public-key/rotate`** per **authenticated user id** (Redis). |
| `PUBLIC_KEY_UPDATE_RATE_LIMIT_MAX` | no | `30` | Max combined public-key updates per user per window. |
| `PUBLIC_KEY_JSON_BODY_MAX_BYTES` | no | `8192` | Max JSON body size (bytes) for **`PUT`/`POST`** public-key routes (smaller than the global **`1mb`** JSON cap). |
| `MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC` | no | `60` | Fixed window for **`POST /messages`** and Socket.IO **`message:send`** (Redis). |
| `MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER` | no | `120` | Max message sends per **authenticated user** per window (REST + socket). |
| `MESSAGE_SEND_RATE_LIMIT_MAX_PER_IP` | no | `360` | Max message sends per **client IP** per window (shared with socket path). |
| `MESSAGE_SEND_RATE_LIMIT_MAX_PER_SOCKET` | no | `120` | Max **`message:send`** per **Socket.IO connection id** per window (not used for REST). |
| `MESSAGE_RECEIPT_RATE_LIMIT_WINDOW_SEC` | no | `60` | Fixed window for Socket.IO receipt events (**`message:delivered`**, **`message:read`**, **`conversation:read`**). |
| `MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_USER` | no | `600` | Max receipt events per **authenticated user** per window. |
| `MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_IP` | no | `2000` | Max receipt events per **client IP** per window. |
| `MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_SOCKET` | no | `600` | Max receipt events per **Socket.IO connection id** per window. |
| `GLOBAL_RATE_LIMIT_WINDOW_SEC` | no | `60` | Global per-client-IP REST cap — fixed-window length (Redis TTL). See **[Global REST rate limit](./GLOBAL_RATE_LIMIT.md)**. |
| `GLOBAL_RATE_LIMIT_MAX` | no | `500` | Max REST requests per IP per window (default ≈ **500/min** with **`WINDOW_SEC=60`**). Enforced by **`middleware/globalRestRateLimit.ts`** on **`/v1`** (see table below). |
| `SENDGRID_API_KEY` | no | — | When **`EMAIL_VERIFICATION_REQUIRED`** is **`true`**, used to send verification mail. If unset, **`sendVerificationEmail`** logs a warning and skips send (registration still succeeds). |

### Global vs per-route rate limits (stacking)

**Decision:** **stack** — the global per-IP limit runs **first** (Express middleware on **`/v1`**). Routes that define **additional** Redis counters still run those checks **after** the global increment; **we do not remove** route-specific limits.

| Layer | Scope | Purpose |
|-------|--------|---------|
| **`GLOBAL_RATE_LIMIT_*`** | Per client IP, almost all **`/v1`** HTTP requests | Broad abuse cap (default **500/min**). |
| **Route limits** (`REGISTER_*`, `FORGOT_PASSWORD_*`, `VERIFY_EMAIL_*`, `USER_SEARCH_*`, `PUBLIC_KEY_UPDATE_*`, `MESSAGE_SEND_*`, `MESSAGE_RECEIPT_*`, `RESEND_*`) | Per IP and/or per email hash / user / socket as implemented | Tighter caps on sensitive or costly actions (e.g. **5** registrations per hour per IP vs **500** generic calls per minute). |

**Request path:** one **`INCR`** on **`ratelimit:global:ip:{ip}`** in middleware; if the handler runs, it may **`INCR`** a **different** key (e.g. **`ratelimit:register:ip:{ip}`**). A client can be blocked by **global** before the route runs, or pass global and then fail a **stricter** route limit. Tuning: lower **`GLOBAL_RATE_LIMIT_MAX`** to tighten everything; lower **`REGISTER_RATE_LIMIT_MAX`** (etc.) to tighten one surface without changing the global budget.

**Reverse proxy (nginx):** Compose **`infra/nginx/nginx.conf`** sets **`X-Forwarded-For`** so **`getClientIp`** sees the browser, not the nginx container. The sample config does **not** use **`limit_req`**; adding edge rate limits **stacks** with app Redis caps unless you tune or disable one — see **`docs/GLOBAL_RATE_LIMIT.md`** (*Operations: reverse proxy*).

### User search policy (`GET /v1/users/search`)

**MVP behaviour:** the API matches **exact normalized email** only (no prefix/typeahead), to limit **email enumeration**. **Redis** per-IP limits (**`USER_SEARCH_RATE_LIMIT_*`**) apply; over the limit the server returns **429** with **`RATE_LIMIT_EXCEEDED`**. Broader discoverability (e.g. prefix search) is tracked in **`docs/TASK_CHECKLIST.md`** (**Feature 5**).
| `EMAIL_FROM` | with SendGrid sends | — | Verified sender in SendGrid (e.g. `noreply@yourdomain.com` or `App Name <noreply@yourdomain.com>`). |
| `PUBLIC_APP_BASE_URL` | with SendGrid sends | — | Web app origin **without** trailing slash (e.g. `https://app.example.com`). Verification links are **`{PUBLIC_APP_BASE_URL}{EMAIL_VERIFICATION_WEB_PATH}?token=...`**. |
| `EMAIL_VERIFICATION_WEB_PATH` | no | `/verify-email` | Path on the web client for the page that reads **`token`** and calls **`POST /v1/auth/verify-email`**. |

*Future:* separate signing keys for access vs refresh — extend here and `loadEnv()` in the same PR.

### Email verification (`EMAIL_VERIFICATION_REQUIRED`)

**Feature 2** (see [`TASK_CHECKLIST.md`](./TASK_CHECKLIST.md) — *Feature 2 — Sign up / log in*): **`User.emailVerified`** is always part of the **`User`** model, but **whether verification is enforced** is controlled only by the **messaging-service** env **`EMAIL_VERIFICATION_REQUIRED`** (not exposed as **`GET /config`** in the API — clients learn behavior from responses and **`User`** / error payloads).

| Server setting | `POST /auth/register` | `User.emailVerified` on new users | `POST /auth/verify-email` / `POST /auth/resend-verification` | Protected JWT routes when verification is required |
|----------------|----------------------|-------------------------------------|--------------------------------------------------------------|---------------------------------------------------|
| **`false`** (default) | Issues tokens per **`AuthResponse`**; no mail required | **`true`** immediately | Return **400** with **`EMAIL_VERIFICATION_DISABLED`** if called | Middleware allows access when token is valid (user is already verified at signup). |
| **`true`** | May return **`accessToken: null`** until verified; SendGrid mail if configured | **`false`** until token consumed | Normal verify/resend flow (rate limits apply) | **`requireAuth`** may reject until **`emailVerified`** is **`true`** (see service middleware). |

**Web-client:** show verify/resend UI when **`getCurrentUser`** / session shows **`emailVerified: false`** and your deployment uses verification — the app does **not** read a separate config flag from the API; align UX with **`docs/openapi/openapi.yaml`** and the env table above.

### Runtime configuration (MongoDB)

**Collection:** **`system_config`** — singleton document **`{ _id: 'singleton' }`**.

| Field | Type | Purpose |
|-------|------|---------|
| **`emailVerificationRequired`** | boolean (optional) | When present, overrides **`EMAIL_VERIFICATION_REQUIRED`** for registration, **`requireAuth`**, verify/resend, and refresh behaviour. |
| **`guestSessionsEnabled`** | boolean (optional) | When present, overrides **`GUEST_SESSIONS_ENABLED`**. Used when guest auth is implemented (**Feature 2a**). |

If the document or a field is missing, **messaging-service** uses the corresponding **env** value (**bootstrap / default**).

**Read path:** each request that needs toggles calls **`getEffectiveRuntimeConfig`** — **Redis GET** key **`messaging:runtime_config:effective`**; on miss, **MongoDB** merge + env, then **Redis SET** with **TTL 5 minutes** (`RUNTIME_CONFIG_REDIS_TTL_SECONDS`). Edits to **`system_config`** therefore propagate within at most **~5 minutes** (or immediately after cache expiry). If Redis is unavailable, the service still reads **MongoDB + env** (no cache).

Example **`mongosh`** upsert:

```js
db.system_config.updateOne(
  { _id: 'singleton' },
  { $set: { emailVerificationRequired: true, guestSessionsEnabled: false, updatedAt: new Date() } },
  { upsert: true }
);
```

After a manual DB edit, delete Redis key **`messaging:runtime_config:effective`** or wait for **~5 minutes** for cached values to expire.

---

## web-client

Env files live under **`apps/web-client/`**. **Committed:** **`.env.development`** (dev server) and **`.env.production`** (production build). Optional **`.env.development.local`** / **`.env.production.local`** override those per machine and are **gitignored** (see root **`.gitignore`** and **`apps/web-client/.gitignore`**).

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_BASE_URL` | no | *(relative)* `/v1` on current origin in dev | REST base URL **including** `/v1`, or a path (`/v1`) when using **Vite** `server.proxy` to nginx (**`8080`**). Absolute example: `http://localhost:8080/v1`. |

**Tokens (browser):** access JWT is **in memory** (Redux); refresh token is **`localStorage`** key **`messaging-refresh-token`**. **`POST /v1/auth/refresh`** on **401** (up to **3** attempts, **1s** between failures, then redirect to **`/login`**) — see **`apps/web-client/src/common/api/httpClient.ts`**.

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
