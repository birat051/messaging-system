# Repository tooling layout

This document locks in the **Repository and tooling** rules from `TASK_CHECKLIST.md` and `PROJECT_GUIDELINES.md`.

## No root TypeScript / ESLint / Prettier for the whole monorepo

Do **not** add any of the following at the **repository root** (`messaging-system/`) in a way that applies to **all** packages at once:

- `tsconfig.json` (or `tsconfig.*.json`) as the single compiler config for every app
- `eslint.config.*`, `.eslintrc.*`, or equivalent ESLint config that lints the entire tree by default
- `prettier.config.*`, `.prettierrc*`, or equivalent Prettier config for the entire tree

## Isolated npm projects (no workspaces)

Each app under **`apps/`** is its **own** npm project:

- **`package.json`**, **`package-lock.json`**, and **`node_modules`** live **inside** that app directory.
- Run **`npm install`** in **`apps/web-client`** and **`apps/messaging-service`** separately (or use the root **`npm run install:all`** helper from the root `package.json`).
- The root **`package.json`** does not use **npm workspaces**; it may only hold repo metadata, `engines`, and optional **aggregate scripts** (`lint:all`, etc.) that delegate with `npm run … --prefix apps/…`.

Per-app tooling lives **inside each deployable**.

## Where tooling belongs

| Area | Tooling location |
|------|------------------|
| **web-client** | `apps/web-client/` — **Vite** + React, **Tailwind CSS v4** (`@tailwindcss/vite`, `tailwind.config.ts`, `src/index.css` `@theme`), **`eslint.config.mjs`**, Prettier + **`prettier-plugin-tailwindcss`** (`TASK_CHECKLIST.md`) |
| **messaging-service** | `apps/messaging-service/` — own `package.json`, `tsconfig.json`, `eslint.config.mjs`, Prettier |
| **API contract** | `docs/openapi/openapi.yaml` — OpenAPI 3 (source of truth). **`web-client`** runs **`openapi-typescript`** → `src/generated/api-types.ts` (`npm run generate:api`). **No** `packages/shared` library. |

Align copy-paste between **messaging-service** and **web-client** conventions when useful; do **not** introduce a `packages/backend-tooling` shared config package unless the team explicitly changes this policy.
