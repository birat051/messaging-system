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

*Future:* JWT secrets, etc. — add rows here and to `loadEnv()` in the same PR.

---

## web-client

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| — | — | — | *Typically `VITE_API_BASE_URL` etc. — add after Vite scaffold.* |

---

## Docker Compose

The stack is defined in **[`../infra/docker-compose.yml`](../infra/docker-compose.yml)** (run from repo root: `docker compose -f infra/docker-compose.yml up -d`). **messaging-service** receives:

- `MONGODB_URI=mongodb://mongo:27017/messaging`
- `REDIS_URL=redis://redis:6379`
- `RABBITMQ_URL=amqp://messaging:messaging@rabbitmq:5672` (override user/pass via **`infra/.env.example`** → `.env`)

**`OPENAPI_SPEC_PATH`** is set in the image to `/app/openapi/openapi.yaml` (baked in at build time).

Optional variable substitution for Compose: copy **`infra/.env.example`** patterns to a **`.env`** next to where you run `docker compose` (see root **`README.md`**).

Keep **TLS / production** notes in [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) §13 and tasks in [`TASK_CHECKLIST.md`](./TASK_CHECKLIST.md).
