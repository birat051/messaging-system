# Messaging Platform — Task Checklist

Use this checklist to track implementation progress. Sections align with [PROJECT_PLAN.md](./PROJECT_PLAN.md).

**Pattern:** For each feature or cross-cutting area below, work is split into **(A) Infra, backend & deployment** and **(B) Web-client, UI, tests & state management** (Redux, hooks, test-first components per `PROJECT_GUIDELINES.md`). **Prerequisite — User keypair** runs before encrypted **Feature 1** work when E2EE is required.

**Granularity:** Where a single bullet used to imply many files or layers (e.g. **MSW** + **handlers** + **test utils**, or **MongoDB** + **RabbitMQ** + **Socket.IO**), it is broken into **nested subtasks** so one PR or one agent prompt can close a **small vertical slice** without rewriting half the app.

---

## Project setup

### (A) Infra, backend & deployment

- [x] **Repository and tooling**
  - [x] Initialize monorepo (`apps/web-client`, `apps/messaging-service`) with per-app folders per `PROJECT_PLAN.md` §10
  - [x] **Do not** add a **single** TypeScript, ESLint, or Prettier configuration at the **repository root** that applies to the whole monorepo
  - [x] **Each deployable is self-contained:** **`messaging-service`** and **`web-client`** each have their **own** **`package.json`**, **TypeScript** config, **ESLint** config, and **Prettier** config—**no** shared tooling package between backend and client (keep configs aligned by convention and copy-paste when useful, not a shared `packages/backend-tooling` dependency)
  - [x] Root **README** documents Node.js version, package manager, and how to run lint/build **per app** (**isolated** `package-lock.json` per app, no npm workspaces); optional root **`install:all` / `*:all`** scripts; **architecture and deployment** linked from **`PROJECT_PLAN.md` §13** and [`README`](../README.md)—no duplication of the full plan in the README
  - [x] **OpenAPI codegen (web-client):** **`openapi-typescript`** (highest npm adoption among the options; actively maintained) generates types from **`docs/openapi/openapi.yaml`** → **`apps/web-client/src/generated/api-types.ts`**; scripts **`generate:api`** / **`generate:api:check`**; ESLint ignores **`api-types.ts`** only; Prettier ignores **`src/generated`**. **No** `packages/shared` — OpenAPI is the contract (`PROJECT_GUIDELINES.md`).

- [x] **messaging-service (skeleton)**
  - [x] Bootstrap Express + TypeScript with env-based config; **local** `tsconfig.json`, **ESLint**, **Prettier**, and **`package.json`** under `apps/messaging-service` only
  - [x] Structured logging, global error handler, request correlation IDs
  - [x] `/health` and `/ready` endpoints
  - [x] MongoDB connection pooling and graceful shutdown
  - [x] **Socket.IO** on HTTP server; **RabbitMQ** client and exchange/queue bindings per `PROJECT_PLAN.md` §3.2

- [x] **messaging-service (Redis + presence)** — `PROJECT_PLAN.md` §3.1: **hot** last-seen in Redis only while Socket.IO is up — client **`presence:heartbeat` ~every 5s** → **`setLastSeen`**; on **disconnect** → **`flushLastSeenToMongo`** (`users.lastSeenAt`) + Redis **`DEL`**. **`handshake.auth.userId`** required. Optional **`SOCKET_IO_REDIS_ADAPTER`**. **In-tab notifications** remain **Socket.IO** only (`PROJECT_PLAN.md` §3.3).
  - [x] **Redis client** (`REDIS_URL` + `LAST_SEEN_TTL_SECONDS`); connect at startup; **graceful shutdown**; **`/v1/ready`** includes Redis ping
  - [x] **Presence pipeline** — **`src/presence/lastSeen.ts`**, **`src/presence/flushLastSeenToMongo.ts`**, **`src/realtime/socket.ts`** (heartbeat throttle ~4.5s)
  - [ ] **Feature 7 (notifications):** emit **Socket.IO** notification events from domain paths — **no** Redis Streams
  - [x] **Feature 6 (read — WebSocket):** **`presence:getLastSeen`** + ack — **`resolveLastSeenForUser`** (`src/presence/resolveLastSeen.ts`): Redis → Mongo → **`{ status: 'not_available' }`**

- [x] **messaging-service (S3 / static uploads)** — **`POST /v1/media/upload`** via **`@aws-sdk/client-s3`** + **`@aws-sdk/lib-storage`** (`Upload`); **MinIO** in Compose; object keys for messages still **Cross-cutting — Media** (MongoDB wire-up)

- [ ] **Docker Compose, nginx, TLS, deployment**
  - [x] **`docker compose`**: **`infra/docker-compose.yml`** — **messaging-service** (image build), MongoDB, Redis, RabbitMQ, MinIO, **nginx** (entry **`http://localhost:8080`**); optional **coturn** — `docker compose -f infra/docker-compose.yml --profile turn up -d`
  - [x] nginx: reverse-proxy REST + **Socket.IO** to **messaging-service** with upgrade headers (`infra/nginx/nginx.conf`)
  - [ ] nginx: serve **`apps/web-client/dist/`** as **static root** (SPA fallback **`index.html`**) — **`infra/nginx/nginx.conf`** + Compose volume or build args
  - [ ] **TLS:** terminate HTTPS (cert paths, HSTS policy) — nginx or outer load balancer; document **`docs/ENVIRONMENT.md`**
  - [ ] **Production WebRTC hardening** (TURN creds rotation, firewall notes) — beyond dev **coturn** profile
  - [x] Document hostnames, ports, one-command bring-up — root **`README.md`**, **`infra/.env.example`**

### (B) Web-client, UI, tests & state management

- [ ] **web-client (skeleton)**
  - [x] Scaffold with **Vite** + **React** + **TypeScript** under `apps/web-client` — **`tsconfig.json`** project references + **`tsconfig.app.json`** / **`tsconfig.node.json`**; **`vite.config.ts`**, **`index.html`**, **`src/main.tsx`**, **`eslint.config.mjs`**, **`.prettierrc.json`** — all **inside `apps/web-client` only**
  - [x] Strict TS (`tsconfig.app.json` — `strict`, unused locals/params, etc.) per `PROJECT_GUIDELINES.md` §1.1
  - [x] **Tailwind CSS v4** + **themes** — **`@tailwindcss/vite`**, **`tailwind.config.ts`**, semantic tokens + **`@theme`** in **`src/index.css`** (`background`, `foreground`, `surface`, `accent`, `border`, `muted`, `ring`, `radius-card`, `shadow-card`); **class-based dark mode** (`html.dark`) + **`ThemeProvider`** / **`useTheme`** / **`ThemeToggle`** + **`localStorage`** (`messaging-theme`); `prettier-plugin-tailwindcss` in **`.prettierrc.json`**
  - [x] **ESLint** (`typescript-eslint`, **`eslint-plugin-react-hooks`**, **`eslint-plugin-react-refresh`**); **Prettier**; optional a11y plugin later
  - [x] **react-router** + **`src/common/utils/apiConfig.ts`** (**`VITE_API_BASE_URL`**, **`getApiBaseUrl`** / **`getSocketUrl`**) + **`App`/`main`** wiring
  - [x] **Vite:** dev **proxy** to API + **`build.outDir`** (`dist/`) for nginx — **`vite.config.ts`**
  - [x] **Socket.IO in a Web Worker:** **`src/workers/socketWorker.ts`** + **`src/common/realtime/socketBridge.ts`** (`postMessage` to main thread)
  - [x] **Presence hook:** **`emit('presence:heartbeat')` every 5s** while connected — **`src/common/hooks/usePresenceConnection`** (**Feature 6**)
  - [x] **Vitest** + **React Testing Library** + **jsdom** (`npm run test` / `test:watch`); **`src/setupTests.ts`**; example **`*.tsx`** component test (**`ThemeToggle`**); mandatory tests only for UI **`*.tsx`** per **`PROJECT_GUIDELINES.md` §4.1.1**; **no** client env-based user impersonation for Socket.IO (identity from session only, per **`PROJECT_GUIDELINES.md` §4.1)
  - [ ] **Static assets / uploads (images, etc.):** follow **Cross-cutting — Media (AWS S3)** (**no AWS SDK in the browser**)
    - [ ] **API:** call **`uploadMedia`** / **`POST /media/upload`** from UI (FormData); handle **`MediaUploadResponse`** (`key` / `url`) — **`src/common/api/mediaApi.ts`** + thin UI hook
    - [ ] **Composer:** file picker, attach flow, pass **`mediaKey`** (or URL) into **`sendMessage`** payload per OpenAPI
    - [ ] **UX:** upload **progress** (XHR/`axios` onUploadProgress or equivalent), cancel/retry, error states
    - [ ] **Thread UI:** render image attachments from API URLs; loading/**lazy** **`alt`** / a11y (**see also** **Cross-cutting — Media (B)**)

- [ ] **web-client — REST mocking and integration tests** (`PROJECT_GUIDELINES.md` §4.1; behaviour-focused RTL + Vitest)
  - [x] **API boundary:** components/hooks import **`src/common/api/*`** only (no ad-hoc URLs); tests mock **`httpClient`** or **`authApi`** / **`usersApi`** / … — **see** **`src/common/api/README.md`**, **`API_PATHS`**, ESLint **`no-restricted-imports`** (no direct **`httpClient`** / **`httpMutations`** / **`axios`** in pages, components, hooks)
  - [x] **Unit tests — mock strategy:** prefer **`vi.mock('../common/api/httpClient')`** or **`vi.mock` one API module**; assert **method + path** (via **`API_PATHS`**) and **resolved UI/state** — not React internals; avoid **`fetch`** stubs — **`src/common/api/usersApi.test.ts`**, **`src/modules/settings/pages/SettingsPage.usersApiMock.test.tsx`**, **`src/common/api/README.md`**
  - [x] **MSW — dependency + Node setup:** add **`msw`** to **`package.json`**; **`src/setupTests.ts`** — **`setupServer`**, **`beforeAll`/`afterEach`/`afterAll`** (`listen`, **`resetHandlers`**, **`close`**)
  - [x] **MSW — handlers:** **`src/common/mocks/handlers.ts`** (or feature-scoped files) — **`http.patch`** for **`*/v1/users/me`** aligned with **`docs/openapi/openapi.yaml`** (intercepts **`axios`**)
  - [x] **Integration harness:** **`renderWithProviders(ui, { route, preloadedState? })`** in **`src/common/test-utils/`** — **`MemoryRouter`** + **`ThemeProvider`** + **`Provider`** + **`SWRConfig`** when needed
  - [x] **Integration tests:** **`server.use`** per test for **401**, empty lists, errors; **`waitFor` / `findBy`** for async UI — **`src/common/integration/msw.integration.test.tsx`**
  - [ ] **Fixtures:** **`__fixtures__/`** or factories for **`User`**, **`AuthResponse`**, list payloads
  - [ ] **Security:** no **`VITE_*`** fake user IDs in tests — mock **HTTP** session/**401** only (`PROJECT_GUIDELINES.md` §4.1)

- [x] **Redux and client architecture**
  - [x] `@reduxjs/toolkit`, `react-redux`, typed `useAppDispatch` / `useAppSelector`, `configureStore` + middleware extension points
  - [x] Feature slices (e.g. auth shell); `<Provider>` with router; `hooks/` for composed logic (`useAuth`, etc.); document middleware vs thunks vs components (`PROJECT_GUIDELINES.md` §4.3)

- [ ] **web-client — Axios, SWR, and global HTTP** (depends on **Redux** + **`react-router`** for session + **401** navigation)
  - [x] **Dependencies:** add **`axios`** and **`swr`** to **`apps/web-client`**; pin versions in **`package.json`** / lockfile
  - [x] **Single Axios instance:** **`src/common/api/httpClient.ts`** + **`attachHttpAuth(store)`** from **`main.tsx`**; **`baseURL`** from **`getApiBaseUrl()`**; re-export **`httpClient`** from **`src/common/api/index.ts`**
  - [x] **Token storage:** access JWT **in memory** (Redux **`auth.accessToken`** only); refresh token in **`localStorage`** (**`src/modules/auth/utils/authStorage.ts`**, key **`messaging-refresh-token`**); **`logout`** / **`clearSessionAndLogin`** clear both; **`applyAuthResponse`** for login/register responses
  - [x] **Auth on requests:** request interceptor attaches **`Authorization: Bearer`** from Redux; **`POST /auth/refresh`** requests omit Bearer (no access token on refresh call)
  - [x] **401 — refresh, retry, login** (**`src/common/api/httpClient.ts`**)
    - [x] **401** on a normal request → if no refresh token → **`clearSessionAndLogin`**
    - [x] **`POST /auth/refresh`** with **`skipAuthRefresh`**; mutex so concurrent **401**s share one refresh
    - [x] Up to **3** refresh attempts, **1s** backoff when refresh error is not **401/403**; **401/403** from refresh → redirect immediately
    - [x] On refresh success → Redux **`setSession`** + optional rotated refresh in **`localStorage`** → **retry original request once** (**`_retryAfterRefresh`**); second **401** → logout + **`/login`**
  - [x] **Router:** **`src/routes/paths.ts`** (**`ROUTES.login`**, **`ROUTES.home`**), **`src/routes/navigation.ts`** (**`setNavigateHandler`** from **`App`**), placeholder **`LoginPage`** at **`/login`**
  - [x] **SWR global setup**
    - [x] **`SWRConfig`** in **`main.tsx`** (inside **`Provider`**) — **`src/common/api/swrConfig.ts`**
    - [x] **`swrFetcher`:** **`httpClient.get` → `r.data`** so **`baseURL`**, interceptors, **401** refresh apply
    - [x] **Mutations:** **`httpMutations.ts`** + **`useSWRMutation`** / **`authApi`** etc. for **POST/PATCH/DELETE**
  - [x] **Feature API modules** (import **`httpClient`** only; types from **`api-types.ts`**)
    - [x] **`paths.ts`** — **`API_PATHS`**
    - [x] **`authApi`**, **`usersApi`**, **`conversationsApi`**, **`messagesApi`**, **`groupsApi`**, **`mediaApi`**, **`systemApi`**
    - [x] Barrel **`index.ts`**
  - [ ] **Tests (`*.tsx` only, §4.1.1)** — split by scenario (each can be one PR):
    - [ ] **401 → refresh → retry success:** MSW or mock **`httpClient`** — first **GET** **401**, **`POST /auth/refresh`** **200**, retried **GET** **200**
    - [ ] **401 → refresh fails → login redirect:** refresh **401** → assert **`navigateToLogin`** / logout (mock **`navigation`**)
    - [ ] **Optional:** component using **`useSWR`(`API_PATHS.users.me`)** + MSW happy path (smoke)

- [ ] **Connection status UI**
  - [ ] **Hook:** map **Socket.IO** lifecycle → **`connecting` | `connected` | `disconnected`** (**`usePresenceConnection`** / **`socketBridge`**)
  - [ ] **State surface (optional):** Redux slice or context if multiple components need the same status
  - [ ] **UI:** **`ConnectionStatusIndicator`** (`*.tsx`) — label + icon/badge; **tests first** per **`PROJECT_GUIDELINES.md` §4.1.1**

### Web-client — directory structure migration (`common/` + `modules/`)

**Reference:** [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) **§10.1** — target layout: **`src/common/`** (shared **`api`**, **`components`**, **`constants`**, **`types`**, **`utils`**) and **`src/modules/<module-id>/`** (per-feature **`components`**, **`stores`**, **`api`**, **`constants`**, **`utils`**, **`types`**, **`pages/`** or **`Page.tsx`**). **Do not** start this migration until the checklist is agreed; execute tasks **in order** where dependencies apply.

- [ ] **Documentation & conventions**
  - [x] Update **`PROJECT_GUIDELINES.md`** (file layout / imports / testing paths) to match **`PROJECT_PLAN.md` §10.1** — replace references to flat **`src/pages/`**, **`src/api/`**, **`src/features/`** with **`common/*`** and **`modules/*`** once migration lands (**§1.2**, **§4.0**, **§4.1.2**, **§4.2**, **§4.3**)
  - [x] Update **`.cursor/rules/web-client.mdc`** (and any README under **`apps/web-client`**) with new import examples and folder rules
  - [x] **Decide once:** route path constants live in **`src/routes/`** only vs **`common/constants/routes`** — **decision:** **`src/routes/`** only (**`paths.ts`** etc.); documented in **`PROJECT_GUIDELINES.md` §4.0**

- [ ] **Scaffold `common/`**
  - [x] Create **`src/common/api/`**, **`src/common/components/`**, **`src/common/constants/`**, **`src/common/types/`**, **`src/common/utils/`** (add minimal **`index.ts`** barrels only where the codebase already uses barrels — avoid empty noise — **`common/api/index.ts`** retained; other dirs have **no** empty barrels)
  - [x] Optional: **`src/common/hooks/`** for shared React hooks if not colocated under **`utils`** (align with §10.1) — **`useAuth`**, **`usePresenceConnection`** moved from **`src/hooks/`**

- [ ] **Move shared / cross-cutting code into `common/`**
  - [x] Move **`src/api/**`** → **`src/common/api/**`** (including **`httpClient`**, **`API_PATHS`**, feature API modules, **`README.md`**); update **`openapi-typescript`** output path only if codegen scripts reference **`src/api`** — **default:** keep **`src/generated/`** at **`src/`** root per §10.1
  - [x] Move **`src/config/`** (e.g. **`api.ts`**) → **`common/constants`** or **`common/utils`** per usage — **`src/common/utils/apiConfig.ts`** (**`getApiBaseUrl`**, **`getSocketUrl`**; env accessors are **utils**, not static constants)
  - [x] Move shared **`src/components/**`** → **`src/common/components/**`**
  - [x] Move shared **`src/lib/**`** into **`common/utils`** as appropriate (**`src/hooks/**`** → **`src/common/hooks/`** done) — **`formValidation.ts`**, **`presenceLabel.ts`** → **`src/common/utils/`**
  - [x] Move shared **`src/types/**`** → **`src/common/types/**`** where still client-local (OpenAPI types remain **`src/generated/`**) — **`axios-auth.d.ts`** (Axios module augmentation)

- [ ] **Scaffold `modules/` and migrate by feature**
  - [x] For each route / feature (e.g. **home**, **settings**, **auth**), create **`src/modules/<module-id>/`** with **`components/`**, **`stores/`**, **`api/`**, **`constants/`**, **`utils/`**, **`types/`**, and **`pages/`** (or **`Page.tsx`**) — **use one naming convention** for page files across modules — **done:** **`modules/home`**, **`modules/settings`**, **`modules/auth`** + **`src/modules/README.md`** (**`*Page.tsx`** in **`pages/`**)
  - [x] Migrate **`src/pages/*`** into the corresponding **`modules/*/pages/`** (or module root) — **`home`**, **`settings`**, **`auth`**; **`App.tsx`** + **`common/integration/msw.integration.test.tsx`** updated; ESLint **`src/modules/**/pages/**`**
  - [x] Migrate **`src/features/auth/**`** (and other feature folders) into **`modules/<auth-module-id>/`** — split **`login`** / **`register`** submodules if that matches routing — **single `modules/auth`**: **`stores/`** (slice + selectors), **`utils/`** (apiError, applyAuthResponse, authStorage, sessionBootstrap), **`components/`** (SessionRestore); login/register/verify **pages** stay in **`modules/auth/pages/`**
  - [x] Move **`src/realtime/`**, **`src/theme/`**, etc., to **`common/`** or the owning **`module/`** based on §10.1 rules of thumb (shared vs single-feature) — **`src/common/realtime/`**, **`src/common/theme/`** (used app-wide, not single module)

- [ ] **Redux & app shell**
  - [x] Colocate slice files under **`modules/*/stores/`**; keep **`src/store/`** for **`configureStore`**, **`rootReducer`**, and wiring imports from modules — **`modules/auth/stores/`** (auth + selectors); **`modules/app/stores/appSlice.ts`** (shell placeholder **`app`** reducer); **`store/store.ts`** wires **`app`** + **`auth`**
  - [x] Update **`main.tsx`**, **`App.tsx`**, **`routes/**`** lazy imports and **`ProtectedRoute`** paths — **`routes/lazyPages.ts`** (**`React.lazy`** per module page), **`routes/RouteFallback.tsx`** + **`Suspense`** in **`App.tsx`**; **`ProtectedRoute`** unchanged (**`ROUTES`** from **`paths.ts`**)

- [ ] **Tooling & quality gates**
  - [x] **`tsconfig.app.json`** / **`vite.config.ts`**: add or adjust path aliases (**`@/common/*`**, **`@/modules/*`**) if used; ensure **`vitest`** / **`@` imports** resolve
  - [x] **`eslint.config.mjs`**: refresh **`no-restricted-imports`** (forbid **`httpClient`** outside **`common/api`**, etc.) for new paths
  - [x] Move **`src/mocks/`**, **`src/test-utils/`**, **`src/integration/`** only if needed; **update all imports** in tests and **`setupTests.ts`**
  - [x] Co-locate **`*.{test,spec}.tsx`** with moved components/pages; fix **`vi.mock`** paths

- [ ] **Verification & cleanup**
  - [x] **`npm run typecheck`**, **`npm run lint`**, **`npm run test`** (and **`test:integration`** if present) — all green
  - [x] Remove empty legacy folders (none blocking — **`src/pages/`**, **`src/features/`** migrated)
  - [x] Smoke **dev server** + critical routes (**login**, **settings**, **home**)

---

## API specification (OpenAPI) and Swagger UI — *complete before REST feature work*

### (A) Infra, backend & deployment

- [x] Author **OpenAPI 3** spec under **`docs/openapi/`** (e.g. `openapi.yaml`): resources, schemas, Bearer JWT, errors, pagination; tags; `/v1`
- [x] **Spec bump `0.1.0`:** user **`profilePicture`** + **`status`**; **`GET /users/search?email=`** + **`UserSearchResult`** (name, avatar, **`conversationId`** nullable); **`POST /messages`** with optional **`conversationId`** + **`recipientUserId`** for new direct threads; **`LimitQuery`** default documented — see **Cross-cutting — User profile, email search, send message, pagination**
- [x] **Spec bump `0.1.1`:** **`RegisterRequest`** — optional **`profilePicture`** (URI) + **`status`** at signup; **`PATCH /users/me`** — **`multipart/form-data`** **`UpdateProfileRequest`** (optional **`file`**, **`status`**, **`displayName`**) — see **Feature 2** + **Cross-cutting**
- [x] **Spec bump `0.1.2`:** **`POST /media/upload`** — **`MediaUploadResponse`**; backend implemented — **Cross-cutting — Media**
- [x] **Spec bump `0.1.3`:** **`POST /media/upload`** — **`MEDIA_MAX_BYTES`** (default 30 MiB) documented in OpenAPI description
- [x] **Spec bump `0.1.4`:** **`/auth/register`**, **`/auth/verify-email`**, **`/auth/resend-verification`** — **Feature 2**
- [x] **Spec / docs (env-gated verification):** **`User.emailVerified`** + verify/resend **`EMAIL_VERIFICATION_REQUIRED`** — **`docs/ENVIRONMENT.md`** + **`openapi.yaml` `0.1.7`** (no **`GET /config`**)
- [x] **messaging-service:** **Zod** — **`src/validation/`** (`schemas.ts` mirrors OpenAPI request bodies / query / path; **`validateBody`**, **`validateQuery`**, **`validateParams`**); **`POST /media/upload`** uses **`createMulterFileSchema`**; **`presence:getLastSeen`** uses **`getLastSeenPayloadSchema`** — wire **`validate*`** on new HTTP routes as they land
- [x] Serve **Swagger UI** from **messaging-service** (`swagger-ui-express`) at **`/api-docs`**; works in Docker Compose / local dev; URL documented in root **`README.md`** and **`OPENAPI_SPEC_PATH`** in **`docs/ENVIRONMENT.md`**
- [ ] Optional: restrict Swagger to non-prod or auth
- [ ] Process: update OpenAPI in same PR as route changes (`PROJECT_GUIDELINES.md` §3)

### (B) Web-client, UI, tests & state management

- [x] Document in README how frontend devs open Swagger (URL, port)
- [x] **web-client:** **openapi-typescript** wired (`generate:api`); contract at **`docs/openapi/openapi.yaml`**

---

## Cross-cutting — Runtime configuration (MongoDB)

**Goal:** Persist **product toggles** in the database so operations can change behaviour **without redeploying** env files. Env vars remain for **bootstrap**, **secrets**, and **defaults** until a config document exists.

- [ ] **Schema:** e.g. singleton **`system_config`** / **`app_settings`** document (or versioned row) in **MongoDB** — fields at minimum:
  - [ ] **`emailVerificationRequired`** (boolean) — **migrates** current **`EMAIL_VERIFICATION_REQUIRED`** semantics from **`apps/messaging-service/src/config/env.ts`**; **fallback:** read env when document missing / first boot
  - [ ] **`guestSessionsEnabled`** (boolean) — when **`false`**, **`POST /auth/guest`** is rejected (**403** / documented **`ErrorResponse` `code`**); when **`true`**, guest flow per **Feature 2a**
- [ ] **Read path:** auth + registration + verify/resend + guest issuance **query effective config** (cached in process memory with short TTL or change-stream invalidation — subtask)
- [ ] **Write path:** internal **admin API**, CLI migration, or seed script to update toggles (authz TBD); **audit** optional
- [ ] **Docs:** **`docs/ENVIRONMENT.md`** — which env keys are **deprecated** / **override-only** vs **DB-owned**; **`docs/GUEST_PRODUCT_RULES.md`** — align **TTL** (30 min) and **refresh** rules when implemented
- [ ] **Tests:** unit/integration for fallback **env → DB** and disabled guest / email verification branches

---

## Cross-cutting — User profile, email search, send message, pagination

**Contract:** **`docs/openapi/openapi.yaml`** **`0.1.4`** (until a config bump) — regenerate **`apps/web-client`** with **`npm run generate:api`** when the spec changes. **Email verification** is **server-controlled** — today via env (**`EMAIL_VERIFICATION_REQUIRED`**); **planned:** **`emailVerificationRequired`** in **MongoDB** runtime config (see **Cross-cutting — Runtime configuration (MongoDB)**) — **Feature 2**.

### (A) Infra, backend & deployment

- [ ] **User document (`users`):** schema fields **`profilePicture`**, **`status`** per **`User`** / **`UserPublic`**
  - [ ] **MongoDB:** migrations / backfill if collections already exist
- [ ] **Signup (`POST /auth/register`):** optional **`profilePicture`** + **`status`** in handler; **`emailVerified`** vs **`EMAIL_VERIFICATION_REQUIRED`** — **Feature 2** (may already match spec; verify)
- [ ] **Update profile (`PATCH /users/me`):** **`multer`** + **`multipart/form-data`**; optional **`file`**, **`status`**, **`displayName`** (at least one part); image → S3 same as **`POST /media/upload`**; response **`User`**
- [ ] **Search by email:** route **`GET /users/search`** + **`validateQuery`**; service resolves **`conversationId`** for direct 1:1 with caller
  - [ ] **Policy:** rate limits + privacy (exact vs prefix) — **Feature 5**
- [ ] **Send message:** route **`POST /messages`** + **`SendMessageRequest`** validation
  - [ ] **New direct 1:1:** no **`conversationId`** → require **`recipientUserId`**; create **conversation** + **message** in one flow
  - [ ] **Existing / group:** **`conversationId`** set; **`recipientUserId`** omitted; authz membership
- [ ] **Paginated list APIs:** shared helper for **`limit`** (default **`20`**, max cap) on **`listConversations`**, **`listMessages`**, search, etc.
- [ ] **PR order:** OpenAPI bump (if needed) → **Zod** → route handler → **MongoDB** persistence

### (B) Web-client, UI, tests & state management

- [ ] **Profile — settings:** build **`FormData`**; **`updateCurrentUserProfile`**; loading/error toasts
- [ ] **Profile — signup:** optional **`profilePicture`** URL + **`status`** on **`registerUser`** (after **`uploadMedia`** if file chosen) per **`RegisterRequest`**
- [ ] **Search UX — input:** debounced **`email`** field; **`searchUsersByEmail`**; empty/loading/error
- [ ] **Search UX — results:** list **name**, **avatar**, **`conversationId`** hint; keyboard/a11y (**Feature 5** overlap)
- [ ] **Composer — new direct thread:** omit **`conversationId`**; pass **`recipientUserId`** from search; store **`Message.conversationId`** from response
- [ ] **Composer — follow-up:** pass **`conversationId`**; omit **`recipientUserId`**

---

## Prerequisite — User keypair: generate, store, and maintain (before encrypted messaging / Feature 1)

**Order:** Complete this section **before** implementing **ciphertext** in **Feature 1** (if MVP requires E2EE from the first message). If you ship **plaintext** messaging first, still complete this early so Feature 1 can switch to encrypted payloads without rework. Aligns with **Feature 11** (full wire protocol and group wrapping); this prerequisite focuses on **lifecycle** only.

**Key model:** **Private keys client-only**; **one public key per user** on the server (optional `keyVersion` for rotation). See terminology in **Feature 11**.

### (A) Infra, backend & deployment

- [ ] **Design doc** in `docs/`: algorithms (e.g. ECDH + AES-GCM hybrid, or chosen suite), key sizes, threat model, rotation rules; server never stores private keys
- [ ] **MongoDB:** collection shape — `userId` → **public key** material, optional `keyVersion`, `updatedAt`; indexes on `userId`; **no device-level** rows
- [ ] **OpenAPI:** paths + schemas for key register / rotate / **`GET` by `userId`**
- [ ] **Routes + Zod:** implement handlers; **authz** on **`GET`** (e.g. only peers who may message)
- [ ] **Validation:** reject malformed keys; max payload size; rate-limit key updates
- [ ] **Audit / security:** no private key fields in any schema; structured logs must never print key material
- [ ] **Operational:** document user-initiated **rotation** (new version) and impact on decrypting old messages (product decision)

### (B) Web-client, UI, tests & state management

- [ ] **Generate**: after **authenticated** session exists, generate keypair in-browser via **Web Crypto API** (or audited lib—**libsodium** / WASM if using X25519); **unit tests** with known test vectors only (no real secrets in repo)
- [ ] **Store private key securely**: never send to server; persist **wrapped** private key in **IndexedDB** (or equivalent), optionally encrypted with a key derived from a **user passphrase** (PBKDF2 / Argon2 with secure parameters); document secure-context (HTTPS) requirement
- [ ] **Upload public key**: call API to register/update **user-level** public key; handle success/failure and retry; **Redux** slice or `crypto` slice for `keyRegistered`, `keyVersion`
- [ ] **Maintain**: **backup** export (encrypted file or documented recovery path); **restore** flow for new browser; **rotate** key UI → new keypair → upload new public key with incremented version; clear UX when local key missing vs server key mismatch
- [ ] **Hooks**: `useKeypairStatus`, `useRegisterPublicKey`, `useRestorePrivateKey` (names illustrative); **tests first** for setup wizard, backup prompt, and error states
- [ ] **Integration checkpoint**: user can complete “encryption setup” end-to-end before **Feature 1** composer sends the first encrypted test payload (dev-only toggle acceptable)

---

## Feature 1 — One-to-one text messaging

### (A) Infra, backend & deployment

- [ ] Depends on **Prerequisite — User keypair** for ciphertext fields and public-key APIs when E2EE is enabled
- [ ] **MongoDB:** **`conversations`** + **`messages`** collections; indexes per **`PROJECT_GUIDELINES.md` §2.0**
- [ ] **`POST /messages`:** **`validateBody`** + service — **lazy-create** direct conversation when **`conversationId`** omitted + **`recipientUserId`** set (**Cross-cutting**)
- [ ] **`GET` conversation messages:** **`listMessages`** — cursor + **`limit`**; authz (**participant** only)
- [ ] **RabbitMQ (1:1):** after persist, **one publish** to **recipient user-scoped** routing key (`PROJECT_PLAN.md` §3.2.1)
- [ ] **RabbitMQ consumer:** consume → **`io.to('user:<id>').emit`** (or equivalent) — **`src/realtime/`** wiring
- [ ] **Socket.IO:** on connection auth, join **`user:<userId>`** room; validate multi-replica (optional **Redis adapter**)
- [ ] **Integration test / manual checklist:** send A→B, B receives on correct room with one broker publish
- [ ] **OpenAPI** for messaging: covered in **`0.1.0`** — implement + **Swagger** stay aligned
- [ ] If shipping **Feature 12** in the same release as Feature 1, add **receipt-related** fields to the message schema early; otherwise **Feature 12** may introduce a migration

### (B) Web-client, UI, tests & state management

- [ ] **Tests first (`*.tsx`):** conversation **list** row; **thread** message list; **composer** — RTL per **`PROJECT_GUIDELINES.md` §4.1.1**
- [ ] **UI — shell:** conversation list layout + active selection state
- [ ] **UI — thread:** scroll container, message bubbles, timestamps
- [ ] **UI — composer:** text input, send button, disabled/loading
- [ ] **Redux:** active **`conversationId`**, normalized **`messagesByConversationId`**, send **pending/error** flags
- [ ] **`useConversation` / `useSendMessage`:** call **`listMessages`** / **`sendMessage`** + wire optimistic updates
- [ ] **Socket.IO:** join **`user:<userId>`** room (server); listen for incoming direct messages → dispatch to Redux; **dedupe** by **`messageId`** (`PROJECT_PLAN.md` §3.2.1)
- [ ] **Optimistic vs server:** reconcile temp ids with server **`Message.id`**
- [ ] **Loading / empty / error** states; **chat** **`role="log"`** / **`aria-live`** where appropriate
- [ ] **Sent tick** (stub) or full **Feature 12** receipts when ready

---

## Feature 2 — Sign up / log in with email and password *(email verification optional via env)*

**Default (demo):** **`EMAIL_VERIFICATION_REQUIRED=false`** — new users get **`emailVerified: true`** on register; no mail. **`User.emailVerified`** stays on the model for all modes.

**Planned:** **`emailVerificationRequired`** moves to **MongoDB** runtime config — see **Cross-cutting — Runtime configuration (MongoDB)** (env remains bootstrap/fallback until migrated).

### (A) Infra, backend & deployment

- [ ] **Email verification toggle (DB):** implement **`emailVerificationRequired`** from **MongoDB** config document; **deprecate** env-only **`EMAIL_VERIFICATION_REQUIRED`** for runtime decisions once migration exists (keep env as **default seed** / **fallback**) — ties to **Cross-cutting — Runtime configuration (MongoDB)**
- [x] User schema: **`users`** collection — unique indexes on **`email`** + **`id`**; **`passwordHash`** (**Argon2id** via **`argon2`**); **`profilePicture`**, **`status`**, **`displayName`**, **`emailVerified`**, **`lastSeenAt`** — see **`src/users/`** + **OpenAPI** `User` — **keep `emailVerified`** (do not remove)
- [x] Registration + **`POST /auth/verify-email`** + **`POST /auth/resend-verification`** + verification JWTs — **`src/routes/auth.ts`**
- [x] **`EMAIL_VERIFICATION_REQUIRED`** (boolean, default **`false`**) — **`apps/messaging-service/src/config/env.ts`**
- [x] Document **`EMAIL_VERIFICATION_REQUIRED`** — **`docs/ENVIRONMENT.md`** + **`infra/.env.example`** (+ Compose)
- [x] When **`EMAIL_VERIFICATION_REQUIRED=false`:** **`POST /auth/register`** sets **`emailVerified: true`**; **`/auth/verify-email`** + **`/auth/resend-verification`** return **400** **`EMAIL_VERIFICATION_DISABLED`** (**`ENVIRONMENT.md`**)
- [x] When **`EMAIL_VERIFICATION_REQUIRED=true`:** **`POST /auth/register`** sets **`emailVerified: false`**
- [x] **SendGrid path:** **`SENDGRID_API_KEY`** + **`EMAIL_FROM`** + **`PUBLIC_APP_BASE_URL`** — **`src/email/sendVerificationEmail.ts`**; verification mail on register; **`resend`** returns **503** if SendGrid throws
- [x] **`verify-email` / `resend-verification`:** JWT validation + **Redis** rate limits (per route)
- [x] **Auth middleware / protected routes:** **`user.emailVerified === true`** only when **`EMAIL_VERIFICATION_REQUIRED`** is **`true`** — **`requireAuthenticatedUser`** / **`requireAuthMiddleware`** (`src/middleware/requireAuth.ts`); **`requireUploadAuth`** for **`POST /v1/media/upload`**
- [x] JWT access + refresh; login/logout/revocation; optional password reset — **`issueAuthTokens`**, Redis refresh tokens + **`refreshTokenVersion`** (`src/auth/issueTokens.ts`, **`refreshTokenRedis.ts`**); **`POST /auth/refresh`**, **`/auth/logout`**; **`/auth/forgot-password`** + **`/auth/reset-password`** (signed JWT + **`setUserPasswordAndBumpVersion`**); OpenAPI **0.1.6**
- [x] **OpenAPI `0.1.4`** — **`/auth/register`**, **`/auth/verify-email`**, **`/auth/resend-verification`**; **`RegisterRequest`** optional **`profilePicture`** + **`status`**; **`PATCH /users/me`** — **`UpdateProfileRequest`** (**`0.1.1`**); **Zod** on auth bodies; login/refresh middleware still **[ ]**

### (B) Web-client, UI, tests & state management

- [x] **Register flow:** form + **`registerUser`** + **`applyAuthResponse`**; optional **`status`** + **`profilePicture`** URL; errors from **`ErrorResponse`** — **`RegisterPage`**, **`routes/paths`**, **`modules/auth/utils/apiError`**
- [x] **Login flow:** form + **`login`** + **`applyAuthResponse`**; handle **403** “email not verified” vs **401** — **`LoginPage`**, **`parseLoginError`** in **`modules/auth/utils/apiError`**
- [ ] **Forgot / reset password** *(deprioritized for now — backend routes exist; web-client screens later):* **`forgotPassword`** + **`resetPassword`** (token from **email link** / query param)
- [x] **Verification UX when `User.emailVerified` is `false`:** **`verifyEmail`** + **`resendVerificationEmail`** screens (state from register or **`getCurrentUser`**) — **`VerifyEmailPage`**, **`ROUTES.verifyEmail`**, **`applyVerifyEmailResponse`**
- [x] **Redux `auth`:** ensure **`user.emailVerified`** populated; after register, route to app vs “check your email” — **`selectEmailVerified`**, **`useAuth`**, **`RegisterPage`** / **`HomePage`** redirect to **`/verify-email`** when unverified
- [x] **Protected routes:** wrapper or loader — unauthenticated → **`/login`**; post-login redirect — **`ProtectedRoute`**, **`postLoginRedirect.ts`**, **`App.tsx`** nested route; login/register/verify preserve **`state.from`**
- [x] **Session restore:** on app load, **`getCurrentUser`** (or refresh) if refresh token present — **`main`/`App`** bootstrap — **`SessionRestore`**, **`sessionBootstrap.ts`** (**`refreshTokens`** → **`getCurrentUser`**)
- [x] **Settings / profile:** **`PATCH /users/me`** via **`updateCurrentUserProfile`** (FormData: image + **status** + **displayName**) — **`SettingsPage`**, **`ROUTES.settings`**
- [x] **Tests first (`*.tsx`):** one screen per test file or shared **`renderWithProviders`** — RTL + MSW per **`PROJECT_GUIDELINES.md` §4.1.1** — **`src/common/test-utils/renderWithProviders.tsx`**, **`src/common/mocks/handlers.ts`** + **`server`**, **`SettingsPage.test.tsx`**, **`HomePage.test.tsx`**, **`src/common/components/ThemeToggle.test.tsx`**
- [x] **Form validation UX** (client) + **API** error mapping (`code` / `message`) — **`lib/formValidation.ts`**, **`parseApiError`** / **`ApiErrorAlert`**, auth + **`SettingsPage`**

---

## Feature 2a — Guest / try-the-platform (temporary access)

**Goal (demo / playground):** Instead of shared demo passwords, visitors **enter a display name only** and receive **temporary access** to **message other users** on the system and explore the product. **Product rules (locked):** [`docs/GUEST_PRODUCT_RULES.md`](./GUEST_PRODUCT_RULES.md) — *update doc on implementation:* **30 min** session + refresh, rate limits, search + DM to registered users, **no settings** / admin / password / billing. **Guest access** **on/off** via **`guestSessionsEnabled`** in **MongoDB** (see **Cross-cutting — Runtime configuration (MongoDB)**), not env-only. Open items (e.g. groups / calls) remain in checklist.

### (A) Infra, backend & deployment

- [x] **Product rules:** Document guest **TTL**, **rate limits**, and **who guests can message** (and what is blocked: e.g. admin, password change, billing) — **[`docs/GUEST_PRODUCT_RULES.md`](./GUEST_PRODUCT_RULES.md)**
- [ ] **Guest enable/disable (DB):** enforce **`guestSessionsEnabled`** from **MongoDB** runtime config — reject **`POST /auth/guest`** when disabled — **Cross-cutting — Runtime configuration (MongoDB)**
- [ ] **Session + refresh TTL (30 minutes):** **access token** lifetime **30 minutes**; issue a **refresh token** for guests with **30 minutes** validity (Redis TTL / stored expiry aligned); document in OpenAPI + **`docs/GUEST_PRODUCT_RULES.md`** + **`docs/ENVIRONMENT.md`** when vars exist
- [ ] **OpenAPI + Zod:** e.g. **`POST /v1/auth/guest`** — body **`{ displayName }`**; response **`accessToken`**, **`refreshToken`**, **`user`** (or public profile), **`expiresAt`**; **`guest: true`** (or equivalent) in **`User`** / token claims — bump spec + **`generate:api`** in same PR as routes.
- [ ] **Persistence:** Guest identity — either rows in **`users`** with **`isGuest: true`** + nullable **`email`**, or a dedicated **`guest_sessions`** / **`users`** slice; indexes + optional **MongoDB TTL** on session documents.
- [ ] **JWT:** Access + refresh for guests (**30 min** each, per above) with **`guest`** claim; align with **Feature 2** token shape so one **auth middleware** can branch **guest vs full user**; **`POST /auth/refresh`** for guest refresh tokens within validity window
- [ ] **Rate limits:** Per **IP** (and optionally per **fingerprint** header) on **`POST /auth/guest`**; abuse caps on sends for guest **`userId`**.
- [ ] **AuthZ:** Apply guest rules on **REST** and **Socket.IO** (join rooms, **`POST /messages`**, search) — guests cannot escalate to full account actions until they **register**.
- [ ] **Lifecycle:** Clear behaviour on expiry (401 + client redirect to name screen); optional **“Continue as guest”** re-issue with same display name policy (collision handling: suffix, uniqueness window).

### (B) Web-client, UI, tests & state management

- [ ] **Entry UX:** **“Try the app”** / **Continue as guest** — single field **display name** (validation: length, profanity optional) → call **`POST /auth/guest`** → store token + user in **`auth`** slice (**Feature 2**).
- [ ] **Discoverability:** From landing, guest path sits **beside** sign-up / login; no email verification for guests.
- [ ] **Session UI:** Persistent **banner** — *You’re using a temporary guest session* — link to **Create account**; show **time remaining** if API exposes **`expiresAt`**.
- [ ] **Routing:** Guest **protected routes** mirror logged-in users where allowed; **block** or **hide** settings that require a real account.
- [ ] **Tests first**, then UI: happy path, expired token, name validation; Redux tests for **guest** vs **registered** state.

---

## Feature 3 — Video / audio call between two users (1:1)

### (A) Infra, backend & deployment

- [ ] **Socket.IO** signaling: offer/answer/ICE; authz for peer pairs
- [ ] **STUN**; **TURN** (coturn in Compose or managed); nginx/WSS/TURN ports documented
- [ ] Optional: emit **Socket.IO** notification events for call state (Feature 7) — same connection as signaling

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: call controls (answer/reject/mute/video/hangup)
- [ ] **Redux** or dedicated hook state for call session (idle / ringing / active / error)
- [ ] WebRTC peer connection lifecycle in hooks; device permissions UX
- [ ] Layout for local/remote video; a11y for controls

---

## Feature 4 — Group call

### (A) Infra, backend & deployment

- [ ] Document decision: mesh vs **SFU/MCU**; containerize SFU in Compose if used
- [ ] **Socket.IO** group signaling: join/leave, participant roster
- [ ] Optional: **Socket.IO** notification event types for group call events (Feature 7)

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: group call join/leave, participant grid/list, dominant speaker optional
- [ ] **State**: participant map, connection quality stubs if needed; Redux or hooks per complexity
- [ ] Reuse or extend 1:1 WebRTC patterns; clear error when SFU unavailable

---

## Feature 5 — Search users by email

### (A) Infra, backend & deployment

- [ ] **Search input is email** (not internal user id): **`GET /v1/users/search?email=`** — returns **`displayName`**, **`profilePicture`**, **`userId`**, and **`conversationId`** if a direct conversation with the searcher already exists (**OpenAPI** `UserSearchResult`)
- [ ] MongoDB index on **email** (exact/prefix per privacy); rate limits
- [ ] Privacy rules (discoverability)
- [x] **OpenAPI** — **`/users/search`** + **`UserSearchResult`** in spec **`0.1.0`** (implementation pending)

### (B) Web-client, UI, tests & state management

- [ ] **Tests first (`*.tsx`):** debounced **`searchUsersByEmail`**; loading → results; empty state
- [ ] **Search field:** controlled input, debounce, **`searchUsersByEmail`** via **`usersApi`**
- [ ] **Results list:** **name**, **avatar**, **`conversationId`** hint; navigate to composer / existing thread
- [ ] **State:** local **`useState`** or small Redux slice for results + **`isLoading`**
- [ ] **a11y:** keyboard navigation, **`aria`** on listbox / options

---

## Feature 6 — Last seen per user

**Algorithm (locked):** While Socket.IO is connected, the **client** sends **`presence:heartbeat` every 5 seconds**; **messaging-service** stores the timestamp in **Redis** (`presence:lastSeen:{userId}`, TTL **`LAST_SEEN_TTL_SECONDS`**). When the **Socket.IO connection closes**, the service **writes that last-seen time to MongoDB** (`users.lastSeenAt` for `users.id === userId`) and **removes** the Redis key. *No* Redis update on connect alone—only heartbeats.

### (A) Infra, backend & deployment

- [x] **Redis (hot / online):** accept **`presence:heartbeat`**; update Redis at most once per **~4.5s** per socket (throttle); **`src/presence/lastSeen.ts`**
- [x] **MongoDB (durable / offline):** on **disconnect**, **`flushLastSeenToMongo`** — copy Redis timestamp → **`users.lastSeenAt`**, then **`DEL`** Redis key; **`src/presence/flushLastSeenToMongo.ts`**
- [x] **Read path (WebSocket):** client emits **`presence:getLastSeen`** with **`{ targetUserId }`** and uses the **ack** callback — server: **Redis first**, then **`users.lastSeenAt`** in MongoDB, else **`{ status: 'not_available' }`** (`resolveLastSeenForUser`)
- *Deprioritized — not required for now:* **Authz on `targetUserId`** for **`presence:getLastSeen`** (optional **REST** mirror in **OpenAPI**) — revisit with **Feature 2** when privacy policy needs it.
- [ ] Future “invisible” / DND if scoped

### (B) Web-client, UI, tests & state management

- [ ] **Worker — heartbeat:** **`setInterval(5000)`** → **`socket.emit('presence:heartbeat')`** while connected; clear on **`disconnect`** (**`socketWorker.ts`**)
- [ ] **Worker / bridge — getLastSeen:** emit **`presence:getLastSeen`** + **`targetUserId`**; forward **ack** to main via **`socketBridge`**
- [ ] **Main thread:** hook **`useLastSeen(targetUserId)`** (or similar) — parse **`ok`** / **`not_available`** / **`error`**
- [ ] **UI — display:** relative time in header / contact row; “online” vs stale (product rules)
- [ ] **Tests first (`*.tsx`):** presentational row/header with mocked **`lastSeenAt`**
- [ ] **State:** **`presenceByUserId`** in Redux or context; selectors for “online” heuristic

---

## Feature 7 — Notifications (multiple types: calls, messages, etc.)

### (A) Infra, backend & deployment

- [ ] **messaging-service**: emit **`notification`** to **`user:<userId>`** / group rooms with **`PROJECT_PLAN.md` §8** payload (`kind`: `message` for direct/group messages, `call_incoming` for audio/video); mute/DND server-side (**no** Redis Streams; **no** separate notification service — `PROJECT_PLAN.md` §3.3)
- [ ] **Web Push** (optional later): VAPID keys in env; subscription storage if product adds background push

### (B) Web-client, UI, tests & state management

- [ ] **Worker:** parse **`notification`** event; **`postMessage`** discriminated payload to main (**`socketWorker`** / **`socketBridge`**)
- [ ] **Main thread:** listener dispatches to Redux or shows toast — thin **`useNotifications`** hook
- [ ] **Redux:** **`notifications`** slice (queue, read ids) — optional middleware later
- [ ] **UI — toasts:** map **`kind`** (`message` vs `call_incoming`, …); **tests first (`*.tsx`)**
- [ ] **UI — optional:** notification centre panel; **Web Push** permission only if (A) implements push
- [ ] **Preferences:** wire DND/mute when server API exists

---

## Feature 8 — Group messaging

### (A) Infra, backend & deployment

- [ ] Group + group-conversation models; membership ACL
- [ ] Persist + **RabbitMQ** + **Socket.IO**: **one broker publish per group message** to **group id** routing key (not per-member RabbitMQ fan-out); consume → emit to **group** Socket.IO room; **server** joins sockets to `group:<groupId>` for each membership (join/leave on membership change); pagination; **delivery/read receipt** behaviour per **Feature 12** for groups (`PROJECT_PLAN.md` §3.2.1)
- [ ] Update **OpenAPI**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: group thread, member list sidebar, composer
- [ ] **Redux**: groups list, active group, messages by group id
- [ ] Hooks for group send/receive; distinguish direct vs group in router/store
- [ ] **Socket.IO client:** subscribe to **each joined group id** room/channel (in addition to **user id** for direct); **UI:** dedupe by **`messageId`**; use **`sender_id`** vs current user (and optimistic state) to avoid duplicate bubbles when the sender receives the same group message on the group channel (`PROJECT_PLAN.md` §3.2.1)
- [ ] **Receipt ticks** for group messages per **Feature 12** (aggregate or per-member policy)

---

## Feature 9 — Create groups

### (A) Infra, backend & deployment

- [ ] Create/update/archive group APIs; authz for admins/creators
- [ ] On membership add/remove, **Socket.IO** join/leave **group id** rooms for affected users (`PROJECT_PLAN.md` §3.2.1)
- [ ] Update **OpenAPI**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: create-group flow (name, members picker), edit group optional
- [ ] **Redux**: create group thunk → refresh groups list; optimistic UI optional
- [ ] Validation and error feedback from API

---

## Feature 10 — Contact list (add users)

### (A) Infra, backend & deployment

- [ ] Contacts collection: owner, contact user, status (pending/accepted/blocked)
- [ ] Send/accept/decline/list APIs; authz
- [ ] Update **OpenAPI**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: contact list, incoming requests, add-by-email/search integration
- [ ] **Redux** slice for contacts + request states; hooks `useContacts`, `useContactRequest`
- [ ] Empty/loading states; navigate to chat from contact

---

## Feature 11 — Message encryption (asymmetric / hybrid; 1:1 and group)

**Prerequisite:** **User keypair** (generate, store, maintain) should be complete before relying on encrypted **Feature 1** / **Feature 8** traffic; this section extends that with **message envelopes**, **group** strategies, and transport alignment.

**Cryptography note (terminology):** In standard asymmetric encryption, **plaintext is encrypted with the recipient’s public key** and **decrypted with the recipient’s private key**. The **sender’s private key** is used to **sign** (authenticity), verified with the **sender’s public key**. Use **hybrid encryption** (e.g. AES-GCM for the message body + asymmetric wrap of the content key) for performance and large payloads. Document the chosen algorithms (e.g. RSA-OAEP / ECDH + AES-GCM), key sizes, and threat model in `docs/`.

**Key model (fixed for this project):** **Private keys are client-only** — never uploaded to or stored on the server. **Public keys are user-level only** — exactly **one logical public key per user** (plus optional **key version** for rotation); **no per-device** public keys or key records.

### (A) Infra, backend & deployment

- [ ] **Threat model and design doc**: server stores **ciphertext** and **user public keys** only; **private keys never leave clients**; document in `docs/`
- [ ] **Public keys (user-level)**: schema `userId` → public key material (and optional `keyVersion`, `updatedAt` for rotation); **no device dimension**; unique index on `userId` (+ version if multi-version history is kept)
- [ ] **APIs**: register/rotate/revoke **the user’s** public key; fetch other users’ public keys by `userId` for encrypting to them (authz: only participants may fetch keys needed for a conversation)
- [ ] **1:1 messages**: persist encrypted payload + metadata (algorithm id, key version, IV/nonce if not embedded); server never receives or stores private keys
- [ ] **Group messaging**: choose and implement a **group key strategy** using **each member’s user-level public key** only — e.g. per-message symmetric content key wrapped for each member; document tradeoffs (fan-out, rotation, joins/leaves)
- [ ] **Socket.IO / RabbitMQ**: payloads remain opaque bytes to the broker; no plaintext logging; document encrypted message envelope in **OpenAPI** / `docs` as needed (no shared TS package)
- [ ] **OpenAPI**: document encrypted message shapes (opaque base64/binary fields, headers for algo version)
- [ ] **Operational**: user-level key rotation policy; UX/docs for **new browser / lost local storage** (restore private key from user backup — not a server “device” concept)

### (B) Web-client, UI, tests & state management

- [ ] **Crypto module** (`web-client`): use **Web Crypto API** and/or audited library (e.g. libsodium via WASM); **unit tests** for encrypt/decrypt/sign/verify helpers (vectors, no real private keys in repo); extend helpers built in **Prerequisite — User keypair** as needed for message payloads
- [ ] **Key lifecycle UI**: ensure **Prerequisite** flows (generate, backup, restore, rotate) cover production needs; add any **message-specific** prompts (e.g. “cannot decrypt—rotate or restore”)
- [ ] **1:1 flow**: before send, fetch recipient’s **user-level** public key (cached in Redux), encrypt (hybrid), send ciphertext; on receive, decrypt with local private key; handle missing/wrong keys with clear UX
- [ ] **Group flow**: for each outgoing group message, build content key, encrypt message, wrap key for **each current member’s** public key (per design in (A)); on receive, unwrap and decrypt; handle member add/remove vs key rotation
- [ ] **Redux / hooks**: `usePublicKey`, `useEncryptMessage`, `useDecryptMessage`; cache peers’ public keys with invalidation on rotation
- [ ] **Tests first** for any UI that displays “encryption unavailable”, rotation banners, or plaintext preview rules

---

## Feature 12 — Sent, delivered, and seen (read receipts / ticks)

**Scope:** Per-message (or per-conversation cursor) **delivery** and **read** state so the UI can show **sent** → **delivered** → **seen** indicators (e.g. tick icons). **Build after Feature 1** (and **Feature 8** for groups) can create and list messages.

**Semantics (define in `docs/`):** **Sent** — server accepted and stored the message. **Delivered** — recipient’s client acknowledged receipt (at-least-once to their device/session). **Seen** — recipient has read the message (e.g. conversation open / read cursor past that `messageId`). Group chats may use per-member delivery/read maps or a simplified “read up to” cursor per member.

### (A) Infra, backend & deployment

- [ ] **Design doc**: 1:1 vs group representation (`deliveredAt` / `seenAt` fields vs per-recipient maps vs `lastReadMessageId` per user per conversation); privacy (e.g. disable read receipts setting — optional follow-up)
- [ ] **MongoDB**: extend message or receipt sub-documents with timestamps or user→timestamp maps; indexes for querying latest receipt state; access patterns per `PROJECT_GUIDELINES.md` §2.0
- [ ] **Socket.IO** (and **RabbitMQ** if cross-node): events such as `message:delivered`, `message:read` / `conversation:read` with `messageId`, `conversationId`, `userId`; idempotent handlers; fan-out to sender and relevant peers
- [ ] **REST** (optional): fetch receipt summary for history sync; align with **OpenAPI**
- [ ] **Ordering**: define how **seen** interacts with **last seen** (Feature 6) — related but distinct (message-level vs user presence)
- [ ] **Rate limits** on receipt floods; no PII in logs

### (B) Web-client, UI, tests & state management

- [ ] **Tests first** for **ReceiptTicks** (or similar) presentational component: states **sent**, **delivered**, **seen** (and loading/unknown)
- [ ] **Outbound**: after send succeeds, show **sent**; on server/event confirmation, advance state as designed
- [ ] **Inbound**: on message received, emit **delivered** ack to server; when user opens thread or message enters viewport (product choice), emit **seen** / read cursor
- [ ] **Redux**: merge receipt updates into message entities or normalized `receiptsByMessageId`; selectors for tick state per bubble
- [ ] **Group UI**: show aggregate or per-member policy (e.g. all delivered / all seen) per design doc
- [ ] **Accessibility**: ticks not sole indicator — optional `aria-label` on status
- [ ] **Feature flags** (optional): hide seen/delivered if user setting disables receipts later

---

## Cross-cutting — Media (AWS S3)

**Scope:** **Static assets** uploaded by users (e.g. **images** in chat). **All S3 access uses the AWS SDK in messaging-service** (`@aws-sdk/client-s3`, and **`@aws-sdk/lib-storage`** if large/multipart uploads). The **web-client** sends files **to messaging-service** only (**no AWS SDK** and **no AWS credentials** in the browser).

### (A) messaging-service (backend) — AWS SDK

- [x] Dependencies: **`@aws-sdk/client-s3`**; **`@aws-sdk/lib-storage`** (`Upload`); **do not** add AWS SDK to **web-client**
- [x] **S3 client factory:** `src/storage/s3Client.ts` — env from `docs/ENVIRONMENT.md`; **MinIO** (`S3_ENDPOINT`, path-style when endpoint set); credentials via env or IAM default chain on AWS
- [x] **Upload path:** **`POST /v1/media/upload`** — multipart **`file`**; **`Authorization: Bearer`** (HS256, `sub`) when **`JWT_SECRET`** set; non-production **`X-User-Id`** for local dev; **conversation-level authz** can be added with messaging (**Feature 1**)
- [x] **Before calling SDK:** **`MEDIA_MAX_BYTES`** (default **30 MiB** via env); allowlisted **MIME** (images + common video types); keys `users/{userId}/{uuid}-{name}`; in-memory buffer up to max (stream to **`Upload`** later if needed)
- [x] **AWS SDK:** **`Upload`** from `@aws-sdk/lib-storage`; response **`{ key, bucket, url? }`** per **OpenAPI** `MediaUploadResponse`
- [ ] **MongoDB:** message (or attachment) documents store **S3 key** (and optional public/base URL); access patterns per `PROJECT_GUIDELINES.md` §2.0
- [x] **Operational:** **`HeadBucket`** on **`/v1/ready`** when S3 configured; **`ensureBucketExists`** at startup; **Compose** wires **MinIO** + **`S3_*`** env (see **`infra/docker-compose.yml`**)

### (B) Web-client (UI) — upload via API only

- [ ] **Tests first (`*.tsx`):** MSW **`POST /media/upload`** → progress callback → resolved **`MediaUploadResponse`**
- [ ] **File picker + FormData:** **`file`** field per OpenAPI; **`uploadMedia`** (**`mediaApi.ts`**)
- [ ] **Progress + cancel:** **`axios` `onUploadProgress`** or XHR; **`AbortController`** for cancel; retry UX
- [ ] **Composer:** after upload, pass **`mediaKey`** / preview URL into **`sendMessage`** — **no** browser **S3** calls
- [ ] **`useMediaUpload` hook:** percent + error state (**no** `aws-sdk` in **`package.json`**)
- [ ] **Thread:** **`<img>`** from API/CDN URLs; **`loading="lazy"`**; **`alt`**; optional lightbox
- [ ] **Env / CDN:** **`VITE_API_BASE_URL`** in **`docs/ENVIRONMENT.md`**; public **bucket/CDN** base URL for **`src`** if different from API origin

---

## Cross-cutting — Infrastructure and hardening

### (A) Infra, backend & deployment

- [ ] Metrics + health for **messaging-service**; structured logs; optional OpenTelemetry
- [ ] Rate limits, audit logs, secrets management, backups, load tests, runbooks

### (B) Web-client, UI, tests & state management

- [ ] Global error boundary + user-friendly API error mapping (Redux middleware or hook)
- [ ] Optional: client-side analytics hooks; performance budgets for bundle size

---

## Manual full-system test checkpoints

Run these when you want to exercise the **whole stack** (Compose, nginx, **messaging-service**, **web-client**, MongoDB, Redis, RabbitMQ, MinIO, optional coturn). Use **after** major merges, **before** demos, or when debugging cross-cutting issues. (Automate later if useful.)

- [ ] **Compose bring-up:** `docker compose -f infra/docker-compose.yml up -d --build` — `docker compose ps` shows expected containers; **`README.md`** host/port match your test.
- [ ] **HTTP health:** **`GET /v1/health`** and **`GET /v1/ready`** via nginx entry (e.g. **`http://localhost:8080`**) — **200** when dependencies are up; **`/v1/ready`** reflects MongoDB, Redis, RabbitMQ, S3 as configured.
- [ ] **Swagger:** **`/api-docs`** loads; spot-check a **public** route, then **Authorize** with a Bearer token and hit a protected route.
- [ ] **Web client:** `npm run dev` in **`apps/web-client`** *or* static **`dist/`** behind nginx — app shell loads; browser **Network** tab shows API calls to expected **`VITE_API_BASE_URL`** / proxy.
- [ ] **Auth path:** register + login **or** login only — session survives refresh (refresh token); **logout** clears client storage as designed; optional: **`EMAIL_VERIFICATION_REQUIRED=true`** path documented in **`ENVIRONMENT.md`**.
- [ ] **Socket.IO:** client reaches **connected** (UI or worker); no repeated **401** loops; **presence:heartbeat** only if **Feature 6** path is enabled.
- [ ] **Quality gates:** `npm run lint` + `npm run typecheck` in **`apps/web-client`** and **`apps/messaging-service`** (and **`npm run test`** where UI **`*.tsx`** tests exist).

When **Feature 1** messaging and later features land, also run the **Definition of done (MVP smoke)** bullets below end-to-end.

---

## Definition of done (MVP smoke)

- [ ] **`docker compose`** brings up **messaging-service** + deps per **`README.md`**
- [ ] **nginx** serves **web-client** **`dist/`** + proxies API (or documented equivalent)
- [ ] **TLS** documented for production (even if local dev stays HTTP)
- [ ] **OpenAPI** in repo; **`npm run generate:api`** in **web-client**; **Swagger** at **`/api-docs`**
- [ ] **Redux** + typed hooks per **`PROJECT_GUIDELINES.md`**
- [ ] **Smoke — auth:** register → login ( **`EMAIL_VERIFICATION_REQUIRED=false`** default; separate smoke if **`true`** )
- [ ] **Smoke — messaging:** 1:1 thread send/receive; optional **group** create + message
- [ ] **Smoke — media:** upload + attach in thread
- [ ] **Smoke — notifications:** in-tab **`notification`** event for a message (or stub)
- [ ] **Smoke — call:** 1:1 call happy path (or documented skip)
- [ ] **Feature 2a (optional):** guest path → message per policy
- [ ] **Socket.IO** status visible (**connecting** / **connected** / **disconnected**)
- [ ] *(If E2EE in scope)* **User keypair** prerequisite + **Feature 11** wire + ciphertext on wire/at rest
- [ ] *(If receipts in scope)* **Feature 12** **sent** / **delivered** / **seen** end-to-end

---

*Checklist version: 5.3 — added **Manual full-system test checkpoints**; subtasks split for smaller PRs/prompts; `EMAIL_VERIFICATION_REQUIRED` (default `false`); keep `User.emailVerified`; conditional verify flow.*
