# Messaging system

Repository layout: **`apps/web-client`** and **`apps/messaging-service`** — each is an **isolated npm project** with its own **`package.json`**, **`package-lock.json`**, and **`node_modules`**. There is **no** npm workspaces hoisting; tooling stays per app (see [`docs/TOOLING.md`](docs/TOOLING.md)).

## Requirements

- **Node.js** `>= 20`
- **Package manager:** **npm** (use a current 10.x; `packageManager` in root `package.json` is advisory)

## Install dependencies (per app)

Run **`npm install` inside each app** after clone:

```bash
cd apps/web-client && npm install && cd ../..
cd apps/messaging-service && npm install && cd ../..
```

Or from the repo root (optional helper):

```bash
npm run install:all
```

## Run lint / typecheck / build (per app)

From the app directory, e.g.:

```bash
cd apps/web-client
npm run dev          # Vite dev server
npm run typecheck
npm run lint
npm run build        # outputs dist/ for nginx

cd apps/messaging-service
npm run typecheck
npm run lint
npm run build
```

| App | Path |
|-----|------|
| web-client | `apps/web-client/` |
| messaging-service | `apps/messaging-service/` |

Optional **root** scripts (convenience only — they shell out with `npm run … --prefix apps/<name>`):

- `npm run lint:all`
- `npm run typecheck:all`
- `npm run format:check:all`

**OpenAPI → TypeScript (web-client):** after editing **`docs/openapi/openapi.yaml`**, run `npm run generate:api` inside **`apps/web-client`** (uses **openapi-typescript**). Use `npm run generate:api:check` in CI to ensure generated types match the spec.

**Swagger UI (messaging-service):** with the service running (see `npm run dev` in **`apps/messaging-service`**), open **`http://localhost:<PORT>/api-docs`** — default **`http://localhost:3000/api-docs`** when `PORT` is unset. The spec is loaded from **`docs/openapi/openapi.yaml`** at startup unless **`OPENAPI_SPEC_PATH`** is set ([`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)). In Docker Compose, mount or copy the spec into the container and set **`OPENAPI_SPEC_PATH`** if the repo layout differs.

The root **`package.json`** does **not** install application dependencies; it only documents engines and these optional aggregate scripts.

## Docker Compose (full stack)

From the **repository root** (where this `README.md` lives):

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

| Entry | URL / port |
|-------|------------|
| **HTTP API + Swagger + Socket.IO** (via nginx) | **`http://localhost:8080`** — e.g. **`http://localhost:8080/api-docs`**, **`http://localhost:8080/v1/health`** |
| **messaging-service** (direct to container, optional) | **`http://localhost:3001`** — host **3001** avoids clashing with local **`npm run dev`** on **3000** |
| MongoDB | `localhost:27017` |
| Redis | `localhost:6379` |
| RabbitMQ AMQP | `localhost:5672` |
| RabbitMQ management UI | **`http://localhost:15672`** (user/pass default **`messaging` / `messaging`**) |
| MinIO S3 API | `localhost:9000` |
| MinIO console | **`http://localhost:9001`** (default **`minio` / `minioadmin`**) |

Optional **TURN** (WebRTC) — same compose file, **`turn`** profile:

```bash
docker compose -f infra/docker-compose.yml --profile turn up -d
```

TURN listens on **`3478`** (TCP/UDP); dev credentials are in **`infra/coturn/turnserver.conf`** (`dev` / `turnsecret`) — replace for anything beyond local testing.

Override RabbitMQ / MinIO defaults via **[`infra/.env.example`](infra/.env.example)** (copy variables to a **`.env`** file in the directory you run `docker compose` from, usually the repo root).

## Environment variables

Per-service variables (for Docker Compose and local runs) are listed in **[`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md)**. Do not commit `.env` files with secrets.

## Documentation (source of truth)

| Topic | Document |
|--------|----------|
| **Env vars per microservice** | [`docs/ENVIRONMENT.md`](docs/ENVIRONMENT.md) |
| **Vision, architecture, stack, Socket.IO + RabbitMQ, repo layout** | [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) |
| **Deployment & operations** | **`docs/PROJECT_PLAN.md`** — **§13**; tasks in [`docs/TASK_CHECKLIST.md`](docs/TASK_CHECKLIST.md) |
| **How to build code** | [`docs/PROJECT_GUIDELINES.md`](docs/PROJECT_GUIDELINES.md) |
| **What to build** | [`docs/TASK_CHECKLIST.md`](docs/TASK_CHECKLIST.md) |

The **project plan** is the canonical place for deployment-oriented instructions as they are implemented; this README stays a short entry point and links there.
