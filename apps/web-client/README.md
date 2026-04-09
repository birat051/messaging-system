# web-client

React + Vite SPA for the messaging platform. **Architecture** and **repo-wide layout** are in [`docs/PROJECT_PLAN.md`](../../docs/PROJECT_PLAN.md) and [`docs/PROJECT_GUIDELINES.md`](../../docs/PROJECT_GUIDELINES.md).

## Folder layout (target)

Aligned with **`PROJECT_PLAN.md` §10.1** and **`PROJECT_GUIDELINES.md` §4.0**:

| Path | Role |
|------|------|
| **`src/common/api/`** | HTTP (`httpClient` — internal), **`API_PATHS`**, `*Api.ts` modules — **the only REST boundary** for UI code. |
| **`src/common/components/`**, **`constants/`**, **`types/`**, **`utils/`**, **`hooks/`**, **`realtime/`**, **`theme/`** | Shared UI; **`realtime/`** (Socket.IO bridge + protocol types); **`theme/`** (**`ThemeProvider`**, **`useTheme`**); **`types/`** includes client-only typings (e.g. **`axios-auth.d.ts`**); **OpenAPI** types stay in **`src/generated/`**; **`utils/`** / **hooks** as above. |
| **`src/modules/<module-id>/`** | Feature-scoped **`components/`**, **`stores/`**, **`api/`**, **`constants/`**, **`utils/`**, **`types/`**, **`pages/`** — see **`src/modules/README.md`** for module IDs and **`*Page.tsx`** naming. |
| **`src/store/`** | `configureStore`, root reducer, **`hooks.ts`**. |
| **`src/routes/`** | **`paths.ts`** (**`ROUTES`**), **`lazyPages.ts`** (**`React.lazy`** page chunks), **`RouteFallback`**, **`ProtectedRoute`**, **`navigation`**, **`postLoginRedirect`**. **`App.tsx`** wraps **`Routes`** in **`Suspense`**. |
| **`src/generated/`** | OpenAPI codegen output (`npm run generate:api`). |
| **`src/workers/`** | Web Workers (e.g. Socket.IO client). |
| **`src/common/integration/`**, **`src/common/mocks/`**, **`src/common/test-utils/`** | MSW, RTL harness, cross-cutting tests. |

**Migration note:** Auth state and helpers live under **`modules/auth/`**; shared code under **`common/`**.

## Imports

- **From UI:** import **`authApi`**, **`usersApi`**, **`API_PATHS`**, **`swrFetcher`**, or the **`common/api`** barrel — **not** `httpClient` / `axios` directly (see ESLint `no-restricted-imports` and **`src/common/api/README.md`**).
- **Within a module:** use relative imports under **`modules/<id>/`**.
- **Path aliases:** `@/` may be added in **`vite.config.ts`** / **`tsconfig`** during migration (e.g. `@/common/api` → `src/common/api`).

## Docs in this app

- **`src/common/api/README.md`** — REST client rules and test mocking patterns.
- **`src/store/README.md`** — Redux slices and store wiring.

## Commands

See **`package.json`**: `npm run dev`, `npm run build`, `npm run test`, `npm run lint`, `npm run generate:api`.
