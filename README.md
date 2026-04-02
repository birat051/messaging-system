# Messaging system

Repository layout: **`apps/web-client`**, **`apps/messaging-service`**, **`apps/notification-service`** — each is an **isolated npm project** with its own **`package.json`**, **`package-lock.json`**, and **`node_modules`**. There is **no** npm workspaces hoisting; tooling stays per app (see [`docs/TOOLING.md`](docs/TOOLING.md)).

## Requirements

- **Node.js** `>= 20`
- **Package manager:** **npm** (use a current 10.x; `packageManager` in root `package.json` is advisory)

## Install dependencies (per app)

Run **`npm install` inside each app** after clone:

```bash
cd apps/web-client && npm install && cd ../..
cd apps/messaging-service && npm install && cd ../..
cd apps/notification-service && npm install && cd ../..
```

Or from the repo root (optional helper):

```bash
npm run install:all
```

## Run lint / typecheck / build (per app)

From the app directory, e.g.:

```bash
cd apps/messaging-service
npm run typecheck
npm run lint
npm run build
```

| App | Path |
|-----|------|
| web-client | `apps/web-client/` |
| messaging-service | `apps/messaging-service/` |
| notification-service | `apps/notification-service/` |

Optional **root** scripts (convenience only — they shell out with `npm run … --prefix apps/<name>`):

- `npm run lint:all`
- `npm run typecheck:all`
- `npm run format:check:all`

**OpenAPI → TypeScript (web-client):** after editing **`docs/openapi/openapi.yaml`**, run `npm run generate:api` inside **`apps/web-client`** (uses **openapi-typescript**). Use `npm run generate:api:check` in CI to ensure generated types match the spec.

The root **`package.json`** does **not** install application dependencies; it only documents engines and these optional aggregate scripts.

## Documentation (source of truth)

| Topic | Document |
|--------|----------|
| **Vision, architecture, stack, Socket.IO + RabbitMQ, repo layout** | [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) |
| **Deployment & operations** | **`docs/PROJECT_PLAN.md`** — **§13**; tasks in [`docs/TASK_CHECKLIST.md`](docs/TASK_CHECKLIST.md) |
| **How to build code** | [`docs/PROJECT_GUIDELINES.md`](docs/PROJECT_GUIDELINES.md) |
| **What to build** | [`docs/TASK_CHECKLIST.md`](docs/TASK_CHECKLIST.md) |

The **project plan** is the canonical place for deployment-oriented instructions as they are implemented; this README stays a short entry point and links there.
