# Messaging Platform — Task Checklist

Use this checklist to track implementation progress. Sections align with [PROJECT_PLAN.md](./PROJECT_PLAN.md).

**Pattern:** For each feature or cross-cutting area below, work is split into **(A) Infra, backend & deployment** and **(B) Web-client, UI, tests & state management** (Redux, hooks, test-first components per **`docs/PROJECT_PLAN.md` §14**). **Prerequisite — User keypair** runs before encrypted **Feature 1** work when E2EE is required. **Default E2EE UX:** no **Settings → encryption** for end users; **chat-thread** E2EE indicator instead—see **Prerequisite — Product direction** and **Feature 1 (B)**.

**Granularity:** Where a single bullet used to imply many files or layers (e.g. **MSW** + **handlers** + **test utils**, or **MongoDB** + **RabbitMQ** + **Socket.IO**), it is broken into **nested subtasks** so one PR or one agent prompt can close a **small vertical slice** without rewriting half the app.

---

## Project setup

### (A) Infra, backend & deployment

- [x] **Repository and tooling**
  - [x] Initialize monorepo (`apps/web-client`, `apps/messaging-service`) with per-app folders per `PROJECT_PLAN.md` §10
  - [x] **Do not** add a **single** TypeScript, ESLint, or Prettier configuration at the **repository root** that applies to the whole monorepo
  - [x] **Each deployable is self-contained:** **`messaging-service`** and **`web-client`** each have their **own** **`package.json`**, **TypeScript** config, **ESLint** config, and **Prettier** config—**no** shared tooling package between backend and client (keep configs aligned by convention and copy-paste when useful, not a shared `packages/backend-tooling` dependency)
  - [x] Root **README** documents Node.js version, package manager, and how to run lint/build **per app** (**isolated** `package-lock.json` per app, no npm workspaces); optional root **`install:all` / `*:all`** scripts; **architecture and deployment** linked from **`PROJECT_PLAN.md` §13** and [`README`](../README.md)—no duplication of the full plan in the README
  - [x] **OpenAPI codegen (web-client):** **`openapi-typescript`** (highest npm adoption among the options; actively maintained) generates types from **`docs/openapi/openapi.yaml`** → **`apps/web-client/src/generated/api-types.ts`**; scripts **`generate:api`** / **`generate:api:check`**; ESLint ignores **`api-types.ts`** only; Prettier ignores **`src/generated`**. **No** `packages/shared` — OpenAPI is the contract (**`docs/PROJECT_PLAN.md` §14**).

- [x] **messaging-service (skeleton)**
  - [x] Bootstrap Express + TypeScript with env-based config; **local** `tsconfig.json`, **ESLint**, **Prettier**, and **`package.json`** under `apps/messaging-service` only
  - [x] Structured logging, global error handler, request correlation IDs
  - [x] `/health` and `/ready` endpoints
  - [x] MongoDB connection pooling and graceful shutdown
  - [x] **Socket.IO** on HTTP server; **RabbitMQ** client and exchange/queue bindings per `PROJECT_PLAN.md` §3.2

- [x] **messaging-service (Redis + presence)** — `PROJECT_PLAN.md` §3.1: **hot** last-seen in Redis only while Socket.IO is up — client **`presence:heartbeat` ~every 5s** → **`setLastSeen`**; on **disconnect** → **`flushLastSeenToMongo`** (`users.lastSeenAt`) + Redis **`DEL`**. **`handshake.auth.userId`** required. **Socket.IO rooms** are **in-memory per process** only (**`PROJECT_PLAN.md` §3.2.2**); **do not** use **`@socket.io/redis-adapter`** for room sync — cross-node delivery uses **RabbitMQ** + local **`io.to(room).emit`**. **In-tab notifications** remain **Socket.IO** only (`PROJECT_PLAN.md` §3.3).
  - [x] **Redis client** (`REDIS_URL` + `LAST_SEEN_TTL_SECONDS`); connect at startup; **graceful shutdown**; **`/v1/ready`** includes Redis ping
  - [x] **Presence pipeline** — **`src/data/presence/lastSeen.ts`**, **`src/data/presence/flushLastSeenToMongo.ts`**, **`src/utils/realtime/socket.ts`** (heartbeat throttle ~4.5s)
  - [ ] **Feature 7 (notifications):** after a message is persisted (in `sendMessageForUser` or the RabbitMQ consumer), emit a **`notification`** Socket.IO event to the recipient's **`user:<recipientUserId>`** room with the **`§8`** envelope (`kind: "message"`, `notificationId`, `occurredAt`, `conversationId`, `messageId`, `senderUserId`, `preview`); for group messages emit to **`group:<groupId>`** — **no** Redis Streams; apply mute/DND before emitting (`PROJECT_PLAN.md` §3.3, §8)
  - [x] **Feature 6 (read — WebSocket):** **`presence:getLastSeen`** + ack — **`resolveLastSeenForUser`** (`src/presence/resolveLastSeen.ts`): Redis → Mongo → **`{ status: 'not_available' }`**

- [x] **messaging-service (S3 / static uploads)** — **`POST /v1/media/upload`** via **`@aws-sdk/client-s3`** + **`@aws-sdk/lib-storage`** (`Upload`); **MinIO** in Compose; object keys for messages still **Cross-cutting — Media** (MongoDB wire-up)

- [ ] **Docker Compose, nginx, TLS, deployment**
  - [x] **`docker compose`**: **`infra/docker-compose.yml`** — **messaging-service** (image build), MongoDB, Redis, RabbitMQ, MinIO, **nginx** (entry **`http://localhost:8080`**); optional **coturn** — `docker compose -f infra/docker-compose.yml --profile turn up -d`
  - [x] nginx: reverse-proxy REST + **Socket.IO** to **messaging-service** with upgrade headers (`infra/nginx/nginx.conf`)
  - [ ] nginx: serve **`apps/web-client/dist/`** as **static root** (SPA fallback **`index.html`**) — **`infra/nginx/nginx.conf`** + Compose volume or build args
  - [ ] **TLS:** terminate HTTPS (cert paths, HSTS policy) — nginx or outer load balancer; document **`README.md`** (Configuration section)
  - [ ] **Production WebRTC hardening** (TURN creds rotation, firewall notes) — beyond dev **coturn** profile
  - [x] Document hostnames, ports, one-command bring-up — root **`README.md`**, **`infra/.env.example`**

### (B) Web-client, UI, tests & state management

- [ ] **web-client (skeleton)**
  - [x] Scaffold with **Vite** + **React** + **TypeScript** under `apps/web-client` — **`tsconfig.json`** project references + **`tsconfig.app.json`** / **`tsconfig.node.json`**; **`vite.config.ts`**, **`index.html`**, **`src/main.tsx`**, **`eslint.config.mjs`**, **`.prettierrc.json`** — all **inside `apps/web-client` only**
  - [x] Strict TS (`tsconfig.app.json` — `strict`, unused locals/params, etc.) per **`docs/PROJECT_PLAN.md` §14** §1.1
  - [x] **Tailwind CSS v4** + **themes** — **`@tailwindcss/vite`**, **`tailwind.config.ts`**, semantic tokens + **`@theme`** in **`src/index.css`** (`background`, `foreground`, `surface`, `accent`, `border`, `muted`, `ring`, `radius-card`, `shadow-card`); **class-based dark mode** (`html.dark`) + **`ThemeProvider`** / **`useTheme`** / **`ThemeToggle`** + **`localStorage`** (`messaging-theme`); `prettier-plugin-tailwindcss` in **`.prettierrc.json`**
  - [x] **ESLint** (`typescript-eslint`, **`eslint-plugin-react-hooks`**, **`eslint-plugin-react-refresh`**); **Prettier**; optional a11y plugin later
  - [x] **react-router** + **`src/common/utils/apiConfig.ts`** (**`VITE_API_BASE_URL`**, **`getApiBaseUrl`** / **`getSocketUrl`**) + **`App`/`main`** wiring
  - [x] **Vite:** dev **proxy** to API + **`build.outDir`** (`dist/`) for nginx — **`vite.config.ts`**
  - [x] **Socket.IO in a Web Worker:** **`src/workers/socketWorker.ts`** + **`src/common/realtime/socketBridge.ts`** (`postMessage` to main thread)
  - [x] **Presence hook:** **`emit('presence:heartbeat')` every 5s** while connected — **`src/common/hooks/usePresenceConnection`** (**Feature 6**)
  - [x] **Vitest** + **React Testing Library** + **jsdom** (`npm run test` / `test:watch`); **`src/setupTests.ts`**; example **`*.tsx`** component test (**`ThemeToggle`**); mandatory tests only for UI **`*.tsx`** per ****`docs/PROJECT_PLAN.md` §14** §4.1.1**; **no** client env-based user impersonation for Socket.IO (identity from session only, per \*\***`docs/PROJECT_PLAN.md` §14** §4.1)
  - [ ] **Static assets / uploads (images, etc.):** follow **Cross-cutting — Media (AWS S3)** (**no AWS SDK in the browser**)
    - [x] **API:** call **`uploadMedia`** / **`POST /media/upload`** from UI (FormData); handle **`MediaUploadResponse`** (`key` / `url`) — **`src/common/api/mediaApi.ts`** + thin UI hook
    - [x] **Composer:** file picker, attach flow, pass **`mediaKey`** (or URL) into **`sendMessage`** payload per OpenAPI
    - [x] **UX:** upload **progress** (XHR/`axios` onUploadProgress or equivalent), cancel/retry, error states
    - [x] **Thread UI:** render image attachments from API URLs; loading/**lazy** **`alt`** / a11y (**see also** **Cross-cutting — Media (B)**)

- [ ] **web-client — REST mocking and integration tests** (**`docs/PROJECT_PLAN.md` §14** §4.1; behaviour-focused RTL + Vitest)
  - [x] **API boundary:** components/hooks import **`src/common/api/*`** only (no ad-hoc URLs); tests mock **`httpClient`** or **`authApi`** / **`usersApi`** / … — **see** **`docs/PROJECT_PLAN.md` §14.4**, **`API_PATHS`**, ESLint **`no-restricted-imports`** (no direct **`httpClient`** / **`httpMutations`** / **`axios`** in pages, components, hooks)
  - [x] **Unit tests — mock strategy:** prefer **`vi.mock('../common/api/httpClient')`** or **`vi.mock` one API module**; assert **method + path** (via **`API_PATHS`**) and **resolved UI/state** — not React internals; avoid **`fetch`** stubs — **`src/common/api/usersApi.test.ts`**, **`src/modules/settings/pages/SettingsPage.usersApiMock.test.tsx`**
  - [x] **MSW — dependency + Node setup:** add **`msw`** to **`package.json`**; **`src/setupTests.ts`** — **`setupServer`**, **`beforeAll`/`afterEach`/`afterAll`** (`listen`, **`resetHandlers`**, **`close`**)
  - [x] **MSW — handlers:** **`src/common/mocks/handlers.ts`** (or feature-scoped files) — **`http.patch`** for **`*/v1/users/me`** aligned with **`docs/openapi/openapi.yaml`** (intercepts **`axios`**)
  - [x] **Integration harness:** **`renderWithProviders(ui, { route, preloadedState? })`** in **`src/common/test-utils/`** — **`MemoryRouter`** + **`ThemeProvider`** + **`Provider`** + **`SWRConfig`** when needed
  - [x] **Integration tests:** **`server.use`** per test for **401**, empty lists, errors; **`waitFor` / `findBy`** for async UI — **`src/common/integration/msw.integration.test.tsx`**
  - [ ] **Fixtures:** **`__fixtures__/`** or factories for **`User`**, **`AuthResponse`**, list payloads
  - [ ] **Security:** no **`VITE_*`** fake user IDs in tests — mock **HTTP** session/**401** only (**`docs/PROJECT_PLAN.md` §14** §4.1)

- [x] **Redux and client architecture**
  - [x] `@reduxjs/toolkit`, `react-redux`, typed `useAppDispatch` / `useAppSelector`, `configureStore` + middleware extension points
  - [x] Feature slices (e.g. auth shell); `<Provider>` with router; `hooks/` for composed logic (`useAuth`, etc.); document middleware vs thunks vs components (**`docs/PROJECT_PLAN.md` §14** §4.3)

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

- [x] **Connection status UI**
  - [x] **Hook:** map **Socket.IO** lifecycle → **`connecting` | `connected` | `disconnected`** (**`usePresenceConnection`** / **`socketBridge`**)
  - [x] **State surface (optional):** Redux slice or context if multiple components need the same status
  - [x] **UI:** **`ConnectionStatusIndicator`** (`*.tsx`) — label + icon/badge; **tests first** per ****`docs/PROJECT_PLAN.md` §14** §4.1.1**

### Web-client — Home & messaging UX (planned fixes)

**Goal:** Address layout, chat-shell patterns, E2EE bootstrap, demo copy removal, and search semantics. Execute as separate PRs where possible; update **OpenAPI** when REST contracts change.

- [x] **Home layout — full width on large screens with `2rem` margins**
  - [x] **`HomePage`** (and any outer wrapper): remove or relax **`max-w-*`** constraints so the authenticated shell **uses available viewport width** on tablet/desktop while keeping **`2rem` (`mx-8` or equivalent)** horizontal margins — align with ****`docs/PROJECT_PLAN.md` §14** §4.2.1** (responsive breakpoints).
  - [x] Verify **no horizontal overflow** at common widths (~390 / 768 / 1024+); adjust padding on **`main`** / header as needed.
  - [x] Update **`HomePage.test.tsx`** (or add RTL checks) if layout structure or visible copy changes.

- [x] **Conversation + thread — WhatsApp-style shell**
  - [x] **Left column:** **search bar on top**, **conversation list below** (reorder **`HomeConversationShell`** / **`UserSearchPanel`** / **`ConversationList`** so search is visually above the list in the same column, not only below the thread).
  - [x] **Right column:** active **thread** (message list + composer); sensible **min widths**, **scroll** regions, and **mobile** stacking (list full-width; master–detail with back—no separate thread route or drawer).
  - [x] **Responsive:** phone / tablet / desktop per §4.2.1; touch-friendly targets.
  - [x] **Tests:** update **`HomeConversationShell.test.tsx`**, **`HomePage.test.tsx`**, and related **`*.tsx`** tests for new structure/selectors.

- [x] **E2EE keys — auto register/fetch on login; avoid spurious “recipient has no key” errors**
  - [x] **Session bootstrap:** after **login** / **session restore** (`main.tsx` / **`SessionRestore`** / **`useRestorePrivateKey`** / **`ensureMessagingKeypair`**): ensure the **sender’s** keypair is **created and registered** (or loaded from secure storage) **before** the user can send or before **`useSendEncryptedMessage`** throws for missing **sender** setup.
  - [x] **Recipient key:** for **first message** to a peer, avoid showing **`The recipient has not registered an encryption key yet. They must use the app on a secure context so a key can be created.`** in normal cases — options: **retry** public-key fetch, **queue** until key appears, or **clearer** empty state; only show a **persistent** error when **`GET /users/{id}/public-key`** is **404** after reasonable retry.
  - [x] **Hooks:** review **`useSendEncryptedMessage`**, **`ensureMessagingKeypair`**, **`useKeypairStatus`**; consider **prefetch** recipient key when a conversation or search result is selected.
  - [x] **Tests:** RTL / unit coverage for login → key ready → send without that error string in the happy path.

- [x] **HomePage — remove demo / debug copy**
  - [x] Remove the **“Semantic tokens: background, surface, accent…”** paragraph and the **API base** / **`VITE_API_BASE_URL` → …** `<dl>` block from **`HomePage.tsx`** (and any duplicate in **README** if undesired).
  - [x] Keep **ThemeToggle** / product-relevant links as needed; **do not** ship raw env values in UI.
  - [x] Update **`HomePage.test.tsx`** assertions that referenced removed strings.

- [x] **User search — similarity match (not exact email only)**
  - [x] **(A) messaging-service:** evolve **`GET /users/search`** (or documented replacement) from **exact email** to **similarity** / **substring** / **prefix** matching (define scoring or ordering — e.g. MongoDB regex + index strategy per ****`docs/PROJECT_PLAN.md` §14** §2**); keep **rate limits** and **Zod** validation; update **`docs/openapi/openapi.yaml`** + controller/validation in the **same PR**.
  - [x] **(B) web-client:** **`usersApi`** / **`UserSearchPanel`** — debounce, placeholder, and **empty-state** copy reflecting **partial** match; **MSW** handlers + tests (`**usersApi.test.ts**`, **`HomePage.test.tsx`**).
  - [x] **Security / abuse:** avoid overly broad queries; cap result count; document behaviour in **`README.md`** (Configuration section) if new env vars are required.

- [ ] **Product polish / UX backlog (observations)** — execute as separate PRs; **OpenAPI + Zod** when REST contracts change; **`*.tsx`** tests first per **`docs/PROJECT_PLAN.md` §14** §4.1 / §4.1.1 where UI changes.

  - [x] **Viewport & shell — full window height, no page overflow**
    - [x] Constrain authenticated layout (**`HomePage`**, **`main`**, root flex) to **available viewport height** (**`100dvh` / `100vh`** + **`min-h-0`** flex children) so the **document/body does not scroll**; only inner panes (list, thread, composer area) scroll.
    - [x] Smoke at ~390 / 768 / 1024+ widths: **no accidental vertical overflow** on the outer shell.

  - [ ] **Register — display name + unique username; search by username or email**
    - [x] **(A) messaging-service:** add **`username`** (or equivalent) on **`User`** — **unique**, indexed, validated; extend **`RegisterRequest`** / **`POST /auth/register`**; extend **`GET /v1/users/search`** (query + matching) so users are discoverable by **similarity** on **email and/or username**; update **`docs/openapi/openapi.yaml`** + **Zod** + tests in the **same PR**.
    - [x] **(B) web-client:** register form — **name** + **username** fields (and existing email/password flows); client validation + error mapping; **`usersApi`** / **`UserSearchPanel`** updated for new search semantics; **MSW** + **`HomePage.test.tsx`** as needed.

  - [x] **Chat thread — long messages: multi-line, no horizontal overflow**
    - [x] Message bubbles / body text: **wrap** long content (**`break-words`**, **`whitespace-pre-wrap`** where appropriate); **no horizontal scrollbar** inside the chat pane — use **`min-w-0`**, **`overflow-x-hidden`**, and list column constraints.
    - [x] **Tests:** **`ThreadMessageList.test.tsx`** (or colocated component tests) for long-string wrapping behaviour if high value.

  - [x] **E2EE — decrypt / display bug (ciphertext shown as message text)**
    - [x] **Symptom:** both parties see **`E2EE_JSON_V1:{...}`** instead of plaintext — indicates decrypt-for-display or **optimistic body** handling is wrong end-to-end.
    - [x] **Investigate:** **`useSendEncryptedMessage`**, message row rendering (**`ThreadMessageList`** / bubble components), Redux **`messagesById`**, and server-stored **`body`** vs client-only plaintext; align **send path** and **receive path** with **`messageEcies`** / envelope parsing.
    - [x] **Fix:** render **decrypted** text in thread for recipients; **sender** optimistic UI must not leave raw envelope as visible copy; add **RTL coverage** so **`E2EE_JSON_V1:`** never appears as user-visible primary content in happy path.

  - [x] **E2EE — sender (A) still sees ciphertext while recipient (B) sees plaintext (same session)**
    - [x] **Symptom:** **A → B** in a live thread: **B**’s client decrypts and shows plaintext; **A**’s own bubbles still show **`E2EE_JSON_V1:`** / wire envelope — **sender-side display** only (distinct from “both see ciphertext” and from **post-reload** durability below). **Verified** (historical): root cause was missing **`senderPlaintextByMessageId`** / merge; **current behaviour** in **`docs/PROJECT_PLAN.md`** §7.1 §4 — own E2EE without map → **`…`**, not wire.
    - [x] **Verify display pipeline:** **`resolveMessageDisplayBody`** (**`messageDisplayBody.ts`**) for **`senderId === self`** + **`isE2eeEnvelopeBody`**: must prefer **`senderPlaintextByMessageId[message.id]`** over **`message.body`**; confirm **`ThreadMessageList`** / bubble path uses this for **all** own rows (including after **SWR** revalidate). **Done:** traced **`HomeConversationShell`** → **`resolveMessageDisplayBody`** → **`ThreadMessageList`** (no bypass); **`hydrateMessagesFromFetch`** overlay documented; **`docs/PROJECT_PLAN.md`** §7.1 §4 (display pipeline); **`messageDisplayBody.test.ts`** — own E2EE ellipsis when map empty.
    - [x] **Trace Redux writes:** **`useSendEncryptedMessage`** → optimistic row → **`replaceOptimisticMessage`** / **`appendIncomingMessageIfNew`** / ack handlers — ensure **`senderPlaintextByMessageId`** is set for the **final server `message.id`** (not only **`client:…`**); check for **race** where hydrate replaces **`messagesById`** before plaintext is keyed by server id. **Done:** traced **`useSendMessage`** → **`replaceOptimisticMessage`** / **`appendIncomingMessageIfNew`**; **`hydrateMessagesFromFetch`** overlay; **`docs/PROJECT_PLAN.md`** §7.1 §4 (Redux send path); **`setSenderPlaintextAfterOptimisticMerge`** in **`messagingSlice`** (optimistic plaintext **or** non-envelope `merged.body`); tests **`messagingSlice.test.ts`** (E2EE **`replaceOptimisticMessage`** + new **`appendIncomingMessageIfNew`** case).
    - [x] **Trace persistence (if reload involved):** **`senderPlaintextPersistListener`** **`put`** runs when plaintext is set; **`loadSenderPlaintextIntoRedux`** + **`hydrateMessagesFromFetch`** order — see also **Option A** subtasks below; confirm same-session bug is not masked by only testing after refresh. **Done:** traced **`senderPlaintextPersistListener`** (post-reducer **`put`** when map entry non-empty); **`loadSenderPlaintextIntoRedux`** after **`setUser`** in **bootstrap / login / register**; **`SessionRestore`** gates shell until bootstrap completes so disk → Redux usually precedes first SWR hydrate; **`docs/PROJECT_PLAN.md`** §7.1 §4 (persistence); same-session vs reload called out (**`messagingSlice` / `messageDisplayBody`** vs **`senderPlaintextPersistListener.test.ts`**).
    - [x] **Fix:** close whichever gap (id reconciliation, missing dispatch, listener edge case, or UI bypassing **`resolveMessageDisplayBody`**); keep **recipient** decrypt path unchanged. **Done:** **`appendIncomingMessageIfNew`** — merge when optimistic row exists even if **`messageIds`** list is stale (queue pruning only drops heads with **no** **`messagesById`** row); id list update when **`optimisticId`** not in **`ids`**; **`resolveMessageDisplayBody`** — own E2EE without map → **`…`**, never wire; tests **`messagingSlice.test.ts`** (stale list + E2EE), **`messageDisplayBody.test.ts`**.
    - [x] **Tests:** **`messageDisplayBody`** unit cases for own E2EE + populated **`senderPlaintextByMessageId`**; **`ThreadMessageList.test.tsx`** (or integration) — after simulated send ack, **sender** visible text is plaintext, **not** substring **`E2EE_JSON_V1:`**. **Done:** **`messageDisplayBody.test.ts`** — server id + populated map; **`ThreadMessageList.test.tsx`** — own row **`body`** as resolved plaintext, document must not match **`E2EE_JSON_V1`**.

  - [x] **Real-time — recipient does not receive `message:new` (1:1, both connected)**
    - [x] **Symptom:** **A** sends via **`message:send`** (E2EE **`body`**); persisted **`Message`** shape is correct; **B**’s client never handles **`message:new`** (no Redux **`appendIncomingMessageIfNew`**) though both show **connected**.
      - **Done:** **messaging-service** omitted **`setMessagingSocketIoServer(io)`** in **`index.ts`** — RabbitMQ consumer skipped all **`message:new`** emits (**fixed**). Subtasks: delivery path, fan-out, web-client receive, infra same-origin, **`Tests / repro`** below.
    - [x] **(A) messaging-service — delivery path:** trace **`message:send`** handler → persist → **RabbitMQ** publish/consume → **`io.to(room).emit('message:new', message)`** — confirm **room** for direct messages (**`user:<recipientUserId>`** vs **`conversation:`** vs **`socket.join`**); verify **recipient** socket is in that room (**`handshake.auth.userId`**); compare with **`messagingSocket.integration.test.ts`**; add **structured logs** (conversation id, recipient id, room name) behind env if needed.
      - **Done:** **Direct** path uses **`message.user.<recipientUserId>`** → consumer **`parseDirectUserRoutingKey`** → **`io.to('user:<userId>').emit('message:new', message)`**; **`socket.join('user:' + auth.user.id)`** in **`socket.ts`** (`auth.kind === 'ok'`). **Bug:** `index.ts` never called **`setMessagingSocketIoServer(io)`**, so **`messagingSocketIo`** stayed **null** and **all** consumer emits were skipped — **fixed:** `setMessagingSocketIoServer(io)` immediately after **`attachSocketIo`**. **Structured logs:** **`MESSAGING_REALTIME_DELIVERY_LOGS`** → **`rabbitmq.ts`** **`info`** fields (routing key, room, message id, conversation id, target user id, skipSocketId).
    - [x] **(A) Fan-out / skip:** confirm **`except(skipSocketId)`** does not drop **B**’s copy; confirm **B** is not the **sender** socket when testing (two browsers / two users).
      - **Done:** **Recipient** publish is **`message.user.<B>`** with **flat** `Message` only — consumer uses **`io.to('user:B').emit`** with **no** **`.except`**. **Sender** echo is **`message.user.<A>`** with **`{ message, skipSocketId: originSocketId }`** — **`io.to('user:A').except(skipSocketId).emit`** only applies to that routing key. **`messagingSocket.integration.test.ts`** — **A** sends via **`message:send`** (two sockets); **B** receives **`message:new`**; spy asserts **B**’s broker body has **no** **`skipSocketId`** / **`message`** wrapper; **A**’s echo body has **`skipSocketId === socketA.id`**.
    - [x] **(B) web-client — receive path:** verify **`socketWorker`** subscribes to **`message:new`**; **`SocketWorkerProvider`** **`message_new`** → **`parseMessageNewPayload`** → **`appendIncomingMessageIfNew`** + **SWR `mutate`**; **`handshake.auth`** **`userId`** matches **B**; no silent parse failure (invalid payload shape).
      - **Done:** **`socketWorker.ts`** — **`socket.on('message:new')`** → **`post({ type: 'message_new', payload })`**; **`connect`** passes **`auth: { userId, token? }`** from **`SocketWorkerProvider`** (**`user.id`** + access token). **`SocketWorkerProvider.tsx`** — **`parseMessageNewPayload`** → **`appendIncomingMessageIfNew`** + **`mutate(['conversation-messages', conversationId, uid])`**; invalid payload → **`console.warn`** in **`import.meta.env.DEV`** (not silent). **`SocketWorkerProvider.test.tsx`** — mocked bridge: peer **`message:new`** updates **`messagesById`**, **`emitReceipt('message:delivered')`**; own message skips auto-delivered; bad shape warns + no Redux append.
    - [x] **(B) Infra:** same **origin** / **nginx** **WebSocket** upgrade as REST (**`/socket.io`**); **`VITE_*` / proxy** points to **messaging-service**; no mixed content / wrong port for socket only.
      - **Done:** **`getSocketUrl()`** / **`getApiBaseUrl()`** share **`VITE_API_BASE_URL`** (**`apiConfig.ts`** JSDoc); relative **`/v1`** → **`window.location.origin`** for Socket.IO; absolute URL → **`new URL(...).origin`**. **Vite** proxies **`/v1`** + **`/socket.io`** (**`vite.config.ts`**). **`infra/nginx/nginx.conf`** — **`location /`** to **messaging-service** with **`map $http_upgrade $connection_upgrade`** + **`Upgrade`** / **`Connection`** / long **`proxy_read_timeout`**. **README** — **“REST + Socket.IO (same origin)”** paragraph. **`apiConfig.test.ts`** — origin behaviour.
    - [x] **Tests / repro:** minimal **integration** or **manual script** — two users, **A** sends, assert **B** receives **`message:new`** (extend existing socket test or add **E2E** note in **README**).
      - **Done:** **`messagingSocket.integration.test.ts`** — added **`B receives message:new when body is opaque E2EE-style string`** (persist + Rabbit + **`io.to('user:B')`**). **README** — **“Testing — `message:new` (A → B, real-time)”**: **`MESSAGING_INTEGRATION=1 npm run test:integration`**, manual two-browser steps + optional WS inspection.

  - [ ] **Read receipts — avoid emitting `message:read` / `conversation:read` when already read**
    - [ ] **Symptom:** client emits **`message:read`** / **`conversation:read`** over Socket.IO even when the message or thread is **already marked read** (REST **`GET …/message-receipts`** or **`receiptsByMessageId`** shows **seen** for the current user).
    - [x] **(B) web-client — guards:** in **`HomeConversationShell`** (or **`useConversation` / receipt hook):** before **`emitReceipt('message:read')`**, skip if **`receiptsByMessageId[messageId]`** already records **current user** as **seen** (per OpenAPI **`MessageReceiptSummary`** shape); before **`conversation:read`**, skip if **last message** / cursor already has **read** state aligned with server (avoid re-emit on **SWR revalidate** / **focus** when state unchanged).
      - **Done:** **`receiptEmitGuards.ts`** — **`currentUserHasSeenMessage`**. **`HomeConversationShell`** — **`onPeerMessageVisible`**: skip + mark **`messageReadEmittedRef`** when **`receiptsByUserId[userId].seenAt`** set; **`conversation:read`** effect: when **last** message is **from peer** and **current user** already **seen**, **skip** emit and **set** cursor ref (no duplicate after SWR receipt hydrate). **Last message own** — no **seen** guard (per-message receipts are peer→reader; cursor still deduped by ref). **Tests:** **`receiptEmitGuards.test.ts`**, **`HomeConversationShell.test.tsx`** (mock **`useSocketWorker`** / **`useConversation`**).
    - [x] **Refinement:** keep **`messageReadEmittedRef`** for in-session dedupe but **hydrate** “already read” from **`mergeReceiptSummariesFromFetch`** so reload does not re-flood; clear refs only when appropriate (conversation switch already clears).
      - **Done:** **`hydratePeerReadDedupeFromReceipts`** in **`receiptEmitGuards.ts`**; **`HomeConversationShell`** — **`useLayoutEffect`** seeds **`messageReadEmittedRef`** / **`conversationReadCursorKeyRef`** from **`receiptsByMessageId`** after **`mergeReceiptSummariesFromFetch`**; **conversation-switch** clear moved to **`useLayoutEffect`** so it runs **before** hydration (same tick as **`activeConversationId`** change). **Tests:** **`receiptEmitGuards.test.ts`**.

  - [ ] **E2EE — own messages after full reload (sender sees plaintext, not wire ciphertext)**
    - **How production messengers usually behave (e.g. WhatsApp):** the **sending device already had plaintext** when the user hit send; the app **persists message history in a local encrypted store** on the phone. After restart, the thread reads from **that local store**, not from “decrypt the server’s stored blob as the sender.” **Multi-device** adds encrypted sync between devices — still **not** “upload the user’s **private** key to our database.”
    - **Why “user key in MongoDB” is the wrong lever:** the **public** directory key **does** belong in the DB (**`GET /users/{id}/public-key`**). The **private** key must **never** be stored server-side. **`E2EE_JSON_V1`** ciphertext is for the **recipient**; the **sender cannot decrypt** it with their own private key, so **`GET /conversations/.../messages`** alone cannot restore “what I typed” without **local durability** of sender copy and/or a **protocol** that includes a sender-readable ciphertext.
    - [x] **Doc:** add a short subsection to **`docs/PROJECT_PLAN.md`** (E2EE / messaging) or **`README.md`**: (1) public vs private key placement; (2) same pattern as above — local durability vs wire-only; (3) link **`messageEcies`** / **`E2EE_JSON_V1`**; (4) optional footnote that optional **cloud backup** (outside core E2EE) is a separate product decision.
    - [ ] **Option A — local sender-plaintext durability (incremental, no protocol change):** treat **`senderPlaintextByMessageId`** as the in-memory leg of **WhatsApp-style local history**; persist **`messageId` → plaintext** to survive full reload; merge on hydrate when **`senderId === self`** and wire **`body`** is E2EE. **Subtasks:**
      - [x] **IndexedDB schema + module:** add a small **`apps/web-client/src/common/...`** module (name TBD, e.g. **`senderPlaintextLocalStore.ts`**) — object store scoped by **signed-in `userId`** (store name or key prefix) with **`messageId`** as key and **UTF-8 plaintext** (or encrypted blob) as value; **`open` / `put` / `get` / `getAll` / `delete` / `clearUser`** async API; **`indexedDB`** required (browser); Vitest uses **`fake-indexeddb`**. **Implemented:** [`apps/web-client/src/common/senderPlaintext/senderPlaintextLocalStore.ts`](apps/web-client/src/common/senderPlaintext/senderPlaintextLocalStore.ts) — compound key **`['userId','messageId']`**, **`deleteEntry`** (JS reserved `delete`); **`__deleteSenderPlaintextDbForTests`** for test isolation; Vitest in **`senderPlaintextLocalStore.test.ts`**.
      - [x] **Bootstrap → Redux:** after **session restore** / **`user.id` known**, **async load** persisted map and **dispatch** merge into **`senderPlaintextByMessageId`** (new action or **`hydrateSenderPlaintextFromDisk`**) **before** or **in parallel with** first **`GET /conversations/{id}/messages`** so **`hydrateMessagesFromFetch`** overlay runs on a populated map. **Implemented:** **`hydrateSenderPlaintextFromDisk`** in **`messagingSlice`**; **`loadSenderPlaintextIntoRedux`** ([`loadSenderPlaintextIntoRedux.ts`](apps/web-client/src/common/senderPlaintext/loadSenderPlaintextIntoRedux.ts)) after **`setUser`** in **`sessionBootstrap`**, **`LoginPage`**, **`RegisterPage`**.
      - [x] **Write-through on send ack:** when **`replaceOptimisticMessage`** / **`appendIncomingMessageIfNew`** sets **sender plaintext** for a server **`message.id`**, **`put(messageId, plaintext)`** to IndexedDB (same paths that set **`senderPlaintextByMessageId[messageId]`** today). **Implemented:** RTK **`senderPlaintextPersistListener`** ([`senderPlaintextPersistListener.ts`](apps/web-client/src/store/senderPlaintextPersistListener.ts)) — **`concat`** on app store + **`createTestStore`**; **`senderPlaintextPersistListener.test.ts`**.
      - **Future scope** (rationale + table: **[`README.md` — Future scope](../README.md#future-scope)**): optional **`sessionStorage` mirror**; **encryption-at-rest**; **cap + eviction**; **logout / `clearUser` + mirror cleanup**; **expanded Vitest** (eviction, full persist → hydrate). Not tracked as blocking MVP tasks here.
      - **Future scope — Option B (dual envelope):** protocol change so the **sender** can decrypt **their** copy from server-stored blobs (**OpenAPI**, **messaging-service**, **web-client**, backward compatibility for legacy single-envelope messages; no private keys on server). **Solves vs tradeoffs:** **[`README.md` — Option B: dual envelope](../README.md#option-b-dual-envelope-protocol)**.
      - **Future scope — product stance (A vs B):** when to stay on **local-only** sender plaintext vs invest in **Option B** for multi-device / “recover from server” — see the same **[`README.md` — Option B](../README.md#option-b-dual-envelope-protocol)** subsection (not a blocking checklist gate).

  - [x] **Composer — send button alignment, icon send, attach icon row, image previews**
    - [x] **Alignment:** vertically **centre** the primary **Send** control with the message input (**flex** + **`items-center`** on the composer row). **Implemented:** **`ThreadComposer`** (`sm:items-center`); **`FollowUpThreadComposer`** / **`NewDirectThreadComposer`** — textarea + Send in **`flex-row sm:items-center`**.
    - [x] **Send affordance:** replace **“Send”** label with a **send icon** (WhatsApp-style); keep accessible **`aria-label`** / **`title`**. **Implemented:** **`SendIcon`** ([`SendIcon.tsx`](apps/web-client/src/common/components/SendIcon.tsx)); **`ThreadComposer`**, **`FollowUpThreadComposer`**, **`NewDirectThreadComposer`** — **`aria-label` / `title`**, spinner while submitting.
    - [x] **Attach:** replace **“Attach file”** text button with an **attach icon** control **to the left of** the send control in the **same** flex row (**`ComposerAttachmentToolbar`** / **`ThreadComposer`**). **Implemented:** **`AttachIcon`**; **`ComposerAttachButton`** + **`attachButtonPlacement="external"`** on **`ThreadComposer`**, **`FollowUpThreadComposer`**, **`NewDirectThreadComposer`**; toolbar default remains icon-only when attach stays in toolbar.
    - [x] **Previews:** show **small thumbnails** above the composer input row for pending image attachments (existing attachment state + layout). **Implemented:** **`imagePreviewUrl`** on **`useComposerMediaAttachment`** (`blob:` for **`image/*`**); **`ComposerImagePreviewStrip`** above the textarea row in **`ThreadComposer`**, **`FollowUpThreadComposer`**, **`NewDirectThreadComposer`**.

  - [x] **User search — remove verbose helper copy**
    - [x] Remove from **`UserSearchPanel`** (or equivalent): **“Matches any part of a stored email…”**, **“Pause typing; search runs after you stop for a moment.”**, **“Enter at least 3 characters…”** — replace with minimal placeholder / no instructional wall of text (debounce behaviour can remain). **Implemented:** **`UserSearchPanel`** — **`placeholder="Search"`**, **`sr-only`** label **“Search users”**; removed empty / too-short / invalid-character helper paragraphs; **`HomePage.test.tsx`** queries updated.

  - [x] **Empty thread pane — centred placeholder**
    - [x] When no conversation is selected, **“Select a conversation to open the thread”** — **centre horizontally and vertically** within the right-hand pane (**`HomeConversationShell`** empty state). **Implemented:** **`thread-empty-placeholder`** — **`items-center`**, **`justify-center`**, **`text-center`**, **`w-full`**, **`min-h-0`**; **`HomeConversationShell.test.tsx`**.

  - [x] **Conversation list row — avatar + two-line preview layout**
    - [x] **Layout:** each row = **flex**: **profile picture** → **stacked block** with **line 1:** user/conversation **name**, **line 2:** **truncated** latest message preview (**`ConversationListRow`** + list data).
    - [x] **Tests:** update **`ConversationListRow.test.tsx`** (and list integration tests) for structure / accessibility.

  - [x] **Connection status — move to global header**
    - [x] Relocate **`ConnectionStatusIndicator`** from the **thread/composer** footer to the **authenticated shell header** (e.g. **`HomePage`** header beside **`ThemeToggle`** / title) so status is **global**, not tied to an open thread.
    - [x] Update **`HomeConversationShell.test.tsx`** / **`ConnectionStatusIndicator`** tests for new placement; keep Redux **`connection`** slice as source of truth.

  - [x] **Header — remove stack / tech marketing line**
    - [x] Remove **“web-client — Vite, React, TypeScript, Tailwind”** (and similar) from the **`HomePage`** header — product-facing copy only.

### Web-client — directory structure migration (`common/` + `modules/`)

**Reference:** [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) **§10.1** — target layout: **`src/common/`** (shared **`api`**, **`components`**, **`constants`**, **`types`**, **`utils`**) and **`src/modules/<module-id>/`** (per-feature **`components`**, **`stores`**, **`api`**, **`constants`**, **`utils`**, **`types`**, **`pages/`** or **`Page.tsx`**). **Do not** start this migration until the checklist is agreed; execute tasks **in order** where dependencies apply.

- [ ] **Documentation & conventions**
  - [x] Update ****`docs/PROJECT_PLAN.md` §14**** (file layout / imports / testing paths) to match **`PROJECT_PLAN.md` §10.1** — replace references to flat **`src/pages/`**, **`src/api/`**, **`src/features/`** with **`common/*`** and **`modules/*`** once migration lands (**§1.2**, **§4.0**, **§4.1.2**, **§4.2**, **§4.3**)
  - [x] Update **`.cursor/rules/web-client.mdc`** (and any README under **`apps/web-client`**) with new import examples and folder rules
  - [x] **Decide once:** route path constants live in **`src/routes/`** only vs **`common/constants/routes`** — **decision:** **`src/routes/`** only (**`paths.ts`** etc.); documented in ****`docs/PROJECT_PLAN.md` §14** §4.0**

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
  - [x] For each route / feature (e.g. **home**, **settings**, **auth**), create **`src/modules/<module-id>/`** with **`components/`**, **`stores/`**, **`api/`**, **`constants/`**, **`utils/`**, **`types/`**, and **`pages/`** (or **`Page.tsx`**) — **use one naming convention** for page files across modules — **done:** **`modules/home`**, **`modules/settings`**, **`modules/auth`** (**`*Page.tsx`** in **`pages/`**); layout per **`docs/PROJECT_PLAN.md` §10.1**
  - [x] Migrate **`src/pages/*`** into the corresponding **`modules/*/pages/`** (or module root) — **`home`**, **`settings`**, **`auth`**; **`App.tsx`** + **`common/integration/msw.integration.test.tsx`** updated; ESLint **`src/modules/**/pages/**`**
  - [x] Migrate **`src/features/auth/**`** (and other feature folders) into **`modules/<auth-module-id>/`** — split **`login`** / **`register`** submodules if that matches routing — **single `modules/auth`**: **`stores/`** (slice + selectors), **`utils/`** (apiError, applyAuthResponse, authStorage, sessionBootstrap), **`components/`** (SessionRestore); login/register/verify **pages** stay in **`modules/auth/pages/`\*\*
  - [x] Move **`src/realtime/`**, **`src/theme/`**, etc., to **`common/`** or the owning **`module/`** based on §10.1 rules of thumb (shared vs single-feature) — **`src/common/realtime/`**, **`src/common/theme/`** (used app-wide, not single module)

- [ ] **Redux & app shell**
  - [x] Colocate slice files under **`modules/*/stores/`**; keep **`src/store/`** for **`configureStore`**, **`rootReducer`**, and wiring imports from modules — **`modules/auth/stores/`** (auth + selectors); **`modules/app/stores/appSlice.ts`** (shell placeholder **`app`** reducer); **`store/store.ts`** wires **`app`** + **`auth`**
  - [x] Update **`main.tsx`**, **`App.tsx`**, **`routes/**`** lazy imports and **`ProtectedRoute`** paths — **`routes/lazyPages.ts`** (**`React.lazy`** per module page), **`routes/RouteFallback.tsx`** + **`Suspense`** in **`App.tsx`**; **`ProtectedRoute`** unchanged (**`ROUTES`** from **`paths.ts`\*\*)

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

## API specification (OpenAPI) and Swagger UI — _complete before REST feature work_

### (A) Infra, backend & deployment

- [x] Author **OpenAPI 3** spec under **`docs/openapi/`** (e.g. `openapi.yaml`): resources, schemas, Bearer JWT, errors, pagination; tags; `/v1`
- [x] **Spec bump `0.1.0`:** user **`profilePicture`** + **`status`**; **`GET /users/search?email=`** + **`UserSearchResult`** (name, avatar, **`conversationId`** nullable); **`POST /messages`** with optional **`conversationId`** + **`recipientUserId`** for new direct threads; **`LimitQuery`** default documented — see **Cross-cutting — User profile, email search, send message, pagination**
- [x] **Spec bump `0.1.1`:** **`RegisterRequest`** — optional **`profilePicture`** (URI) + **`status`** at signup; **`PATCH /users/me`** — **`multipart/form-data`** **`UpdateProfileRequest`** (optional **`file`**, **`status`**, **`displayName`**) — see **Feature 2** + **Cross-cutting**
- [x] **Spec bump `0.1.2`:** **`POST /media/upload`** — **`MediaUploadResponse`**; backend implemented — **Cross-cutting — Media**
- [x] **Spec bump `0.1.3`:** **`POST /media/upload`** — **`MEDIA_MAX_BYTES`** (default 30 MiB) documented in OpenAPI description
- [x] **Spec bump `0.1.4`:** **`/auth/register`**, **`/auth/verify-email`**, **`/auth/resend-verification`** — **Feature 2**
- [x] **Spec / docs (env-gated verification):** **`User.emailVerified`** + verify/resend **`EMAIL_VERIFICATION_REQUIRED`** — **`README.md`** (Configuration section) + **`openapi.yaml` `0.1.7`** (no **`GET /config`**)
- [x] **messaging-service:** **Zod** — **`src/validation/`** (`schemas.ts` mirrors OpenAPI request bodies / query / path; **`validateBody`**, **`validateQuery`**, **`validateParams`**); **`POST /media/upload`** uses **`createMulterFileSchema`**; **`presence:getLastSeen`** uses **`getLastSeenPayloadSchema`** — wire **`validate*`** on new HTTP routes as they land
- [x] Serve **Swagger UI** from **messaging-service** (`swagger-ui-express`) at **`/api-docs`**; works in Docker Compose / local dev; URL documented in root **`README.md`** and **`OPENAPI_SPEC_PATH`** in **`README.md`** (Configuration section)
- [ ] Optional: restrict Swagger to non-prod or auth
- [ ] Process: update OpenAPI in same PR as route changes (**`docs/PROJECT_PLAN.md` §14** §3)

### (B) Web-client, UI, tests & state management

- [x] Document in README how frontend devs open Swagger (URL, port)
- [x] **web-client:** **openapi-typescript** wired (`generate:api`); contract at **`docs/openapi/openapi.yaml`**

---

## Cross-cutting — Runtime configuration (MongoDB)

**Goal:** Persist **product toggles** in the database so operations can change behaviour **without redeploying** env files. Env vars remain for **bootstrap**, **secrets**, and **defaults** until a config document exists.

- [x] **Schema:** singleton **`system_config`** document in **MongoDB** (`_id: 'singleton'`) — fields at minimum:
  - [x] **`emailVerificationRequired`** (boolean) — **migrates** current **`EMAIL_VERIFICATION_REQUIRED`** semantics from **`apps/messaging-service/src/config/env.ts`**; **fallback:** read env when document missing / first boot — **`src/config/runtimeConfig.ts`**, **`buildEffectiveRuntimeConfigFromDb`**
  - [x] **`guestSessionsEnabled`** (boolean) — env default **`GUEST_SESSIONS_ENABLED`** until set in DB; reserved for **`POST /auth/guest`** (**Feature 2a**)
- [x] **Read path:** auth + registration + verify/resend (+ future guest) **query effective config** via **`getEffectiveRuntimeConfig`** — **Redis first** (TTL **5 min**), then **MongoDB** + env on miss; **`RUNTIME_CONFIG_REDIS_KEY`**, **`RUNTIME_CONFIG_REDIS_TTL_SECONDS`** in **`runtimeConfig.ts`**
- [ ] **Write path:** internal **admin API**, CLI migration, or seed script to update toggles (authz TBD); **audit** optional
- [ ] **Docs:** **`README.md`** (Configuration section) — which env keys are **deprecated** / **override-only** vs **DB-owned**; **`docs/PROJECT_PLAN.md`** and **`README.md`** — align **TTL** (30 min) and **refresh** rules when implemented
- [ ] **Tests:** unit/integration for fallback **env → DB** and disabled guest / email verification branches

---

## Cross-cutting — User profile, email search, send message, pagination

**Contract:** **`docs/openapi/openapi.yaml`** **`0.1.13`** (until a config bump) — regenerate **`apps/web-client`** with **`npm run generate:api`** when the spec changes. **Email verification** is **server-controlled** — **`EMAIL_VERIFICATION_REQUIRED`** env with optional **MongoDB** override **`system_config.emailVerificationRequired`** (see **Cross-cutting — Runtime configuration (MongoDB)**) — **Feature 2**.

**Send transport (target):** the **primary** client path for **sending** a message should be **Socket.IO** on the existing real-time connection, not **`POST /v1/messages`**. **Domain** validation and persistence (**`SendMessageRequest`**, **`sendMessageForUser`**, **`Message`**) stay; only the **transport** moves. See **Send path — Socket.IO (target)** below.

### (A) Infra, backend & deployment

- [x] **User document (`users`):** schema fields **`profilePicture`**, **`status`** per **`User`** / **`UserPublic`** — **`UserDocument`**, **`UserApiShape`**, **`UserPublicApiShape`** + **`toUserPublicShape`** (**`src/data/users/users.collection.ts`**, **`users.types.ts`**, **`publicUser.ts`**); reads normalized via **`normalizeUserDocument`**
  - [x] **MongoDB:** migrations / backfill if collections already exist — **`ensureUserProfileFieldsBackfill`** (**`users.collection.ts`**, startup after indexes)
- [x] **Signup (`POST /auth/register`):** optional **`profilePicture`** + **`status`** in handler; **`emailVerified`** vs **`getEffectiveRuntimeConfig(env).emailVerificationRequired`** (env **`EMAIL_VERIFICATION_REQUIRED`** + MongoDB **`system_config`**) — **Feature 2** — verified: **`registerRequestSchema`**, **`createUser`**, **`routes/auth.ts`**
- [x] **Update profile (`PATCH /users/me`):** **`multer`** + **`multipart/form-data`**; optional **`file`**, **`status`**, **`displayName`** (at least one part); image → S3 same as **`POST /media/upload`**; response **`User`** — **`src/routes/users.ts`**, **`storage/userMediaUpload.ts`**, **`updateUserProfile`** (**`repo.ts`**)
- [x] **Search by email:** route **`GET /users/search`** + **`validateQuery`**; service resolves **`conversationId`** for direct 1:1 with caller
  - [x] **Policy:** **Redis** per-IP rate limits (**`USER_SEARCH_RATE_LIMIT_*`**) + **privacy** — **exact match** on normalized email only; **prefix / typeahead** discoverability deferred — **Feature 5** follow-up
- [x] **Send message (interim — REST):** route **`POST /messages`** + **`SendMessageRequest`** validation (**`validateBody`** + **`sendMessageRequestSchema`**); **`201`** + **`Message`** — superseded for **normal clients** by **Socket.IO** send (**Send path — Socket.IO (target)**)
  - [x] **New direct 1:1:** no **`conversationId`** → require **`recipientUserId`**; create **conversation** + **message** in one flow
  - [x] **Existing direct:** **`conversationId`** set; **`recipientUserId`** omitted; participant authz (**`group`** → **403** stub until group model exists)
- [x] **Paginated list APIs:** shared helper for **`limit`** (default **`20`**, max cap) on **`listConversations`**, **`listMessages`**, search, etc. — **`src/validation/limitQuery.ts`** (**`limitQuerySchema`**, **`resolveListLimit`**, **`DEFAULT_LIST_LIMIT`**, **`MAX_LIST_LIMIT`**); **`paginationQuerySchema`** / **`searchUsersQuerySchema`** use it; **`GET /users/search`** passes **`resolveListLimit`** into **`searchUsersByEmailForCaller`**
- [ ] **PR order:** OpenAPI bump (if needed) → **Zod** → route handler → **MongoDB** persistence

### (B) Web-client, UI, tests & state management

- [x] **Profile — settings:** build **`FormData`** (**`buildProfileFormData`**); **`updateCurrentUserProfile`**; **`ToastProvider`** / **`useToast`** (success + API error); button **Saving…** / **`aria-busy`**
- [x] **Profile — signup:** optional **`profilePicture`** + **`status`** on **`registerUser`** per **`RegisterRequest`** — **file** first → **`PATCH /users/me`** after session (**`updateCurrentUserProfile`**) when **`accessToken`** returned; optional **URL** under “advanced” if no file; verify-email / no-token path uses **toast** to point to **Settings**
- [x] **Search UX — input:** debounced **`email`** field; **`searchUsersByEmail`**; empty/loading/error
- [x] **Search UX — results:** list **name**, **avatar**, **`conversationId`** hint; keyboard/a11y (**Feature 5** overlap)
- [x] **Composer — new direct thread:** omit **`conversationId`**; pass **`recipientUserId`** from search; store **`Message.conversationId`** from response
- [x] **Composer — follow-up:** pass **`conversationId`**; omit **`recipientUserId`**

### Send path — Socket.IO (target)

**Rationale:** **Socket.IO** is the real-time channel; sending via **`POST /messages`** duplicates transport and bypasses the persistent connection. **Keep** the same **service** and **schemas** (**`sendMessageForUser`**, **`SendMessageRequest`**, **`Message`**); **change** the **client entry** to a **Socket.IO** emit (with **ack** / server emit to recipient per **`PROJECT_PLAN.md`**).

#### (A) Infra, backend & deployment

- [x] **Socket.IO inbound event** — e.g. **`message:send`** or aligned name in **`src/utils/realtime/`** — payload matches **`SendMessageRequest`**; validate with **`sendMessageRequestSchema`** (shared with REST until removed); call **`sendMessageForUser`**; respond via **ack** with **`Message`** or **`ErrorResponse`**-shaped error; enforce **auth** (handshake **`userId`** / JWT parity with REST)
- [x] **`POST /v1/messages`:** **deprecate** (OpenAPI **`deprecated: true`**), **remove** for default clients, or keep **only** for integration tests / tooling — pick one and document in **OpenAPI** + code comments
- [x] **Rate limits / abuse:** align **Socket.IO** send path with REST-era limits where applicable (per **user** / **IP** / connection)

#### (B) Web-client, UI, tests & state management

- [x] **Composer / `useSendMessage`:** emit on **socket** (**`socketBridge`** / worker) instead of **`messagesApi.sendMessage`** (HTTP); handle **ack** errors and optimistic UI
- [x] **MSW / tests:** mock **socket** send path or keep HTTP mock only if REST retained for tests — **Vitest:** **`useSendMessage`** mocked with **`mockSendMessageForVitest`** (in-memory **`Message`** ack, no deprecated REST); **`parseMessageSendAck`** unit-tested for real acks

#### OpenAPI + docs

- [x] **`docs/openapi/openapi.yaml`:** document **transport split** — **primary send** = **Socket.IO** (reference event name + payload parity with **`SendMessageRequest`** and response parity with **`Message`** in **`info.description`** and/or **`POST /messages`** operation **description**); state that **OpenAPI** does **not** fully describe WebSocket/Socket.IO wire format — **supplement** with prose (and optional **`docs/`** link); mark **`POST /messages`** **deprecated** or document removal timeline if applicable; bump spec version when text lands; **`npm run generate:api`**

---

## Cross-cutting — Global rate limiting (messaging-service)

**Goal:** move from **route-only** Redis limits to a **global per-IP** cap on API traffic, with a **default target of 500 calls per minute** per client IP (exact window/max expressed via env — e.g. **60 s** window, **500** max requests, or equivalent).

### (A) Infra, backend & deployment

- [ ] **Global per-IP rate limit — 500 calls / minute (configurable)**
  - [x] **Design:** map **500/min** to implementation (fixed-window counter in Redis — e.g. **`GLOBAL_RATE_LIMIT_WINDOW_SEC=60`**, **`GLOBAL_RATE_LIMIT_MAX=500`**) and document semantics (bursts, clock skew) — **`README.md`** (Configuration — rate limits), **`globalRestRateLimit.ts`**, **`env.ts`**
  - [x] **Express middleware:** single early **`app.use`** on **`/v1`** (or appropriate prefix) so most REST traffic is covered; respect **`trust proxy`** for client IP (**`getClientIp`**) — **`middleware/globalRestRateLimit.ts`**, **`app.ts`**
  - [x] **Path exclusions:** do **not** count (or bypass) **`GET /v1/health`**, **`GET /v1/ready`**, and public **`/api-docs`** (and any other liveness/readiness routes); decide how **Socket.IO** on the same HTTP server interacts with the limit (upgrade / long-poll — typically **exclude** from REST global counter) — health/ready skipped in middleware; **`/api-docs`** off **`/v1`**; Socket.IO documented in **`README.md` (rate limits)**
  - [x] **Redis:** reuse **`apps/messaging-service/src/utils/auth/rateLimitRedis.ts`** primitives; stable key pattern (e.g. **`ratelimit:global:ip:{ip}`**)
  - [x] **Relationship to existing per-route limits:** **`POST /auth/register`**, **`/auth/forgot-password`**, **`/auth/verify-email`**, **`GET /users/search`**, etc. — decide **stack** (global **and** stricter route limit), **replace** redundant route limits, or **tier** (document in code + **`README.md` (Configuration)**) — **stack** (separate Redis keys; global first); documented in **`README.md` (Configuration)**, **`README.md` (rate limits)**, route **`auth`/`users`/`messages`** comments
  - [x] **429 responses:** stable JSON (**`AppError`** / **`RATE_LIMIT_EXCEEDED`** or dedicated code); optional **`Retry-After`** header if product wants it — **`AppError`** + **`errorHandler`**; **`Retry-After`** not set (optional follow-up)
  - [x] **Configuration:** extend **`apps/messaging-service/src/config/env.ts`**; document in **`README.md`** (Configuration section) and **`infra/.env.example`**
  - [x] **Operational:** confirm behaviour behind **nginx** (real client IP via **`X-Forwarded-For`**) and avoid double-throttling at edge vs app unless intentional — **`infra/nginx/nginx.conf`** + **`README.md`** (Configuration — rate limits) § Operations; **`getClientIp`** JSDoc; **`README.md` (Configuration)** pointer
  - [x] **Tests:** middleware unit/integration tests with Redis mocked or test container; cover excluded paths — **`vitest`** + **`supertest`**; **`isGlobalRestRateLimitExceeded`** mocked; **`globalRestRateLimit.test.ts`** (health/ready excluded, 429, **`X-Forwarded-For`**)

### (B) Web-client, UI, tests & state management

- [x] **HTTP client:** ensure **429** from global limit is handled consistently (**`httpClient`** interceptors / shared error mapping) — user-visible message vs silent retry policy (**do not** infinite-retry on **429**) — **`httpClient`** early **429** reject; **`performRefresh`** does not retry on **429**; **`parseApiError`** / **`apiError.test.ts`**
- [x] **Optional:** dedicated toast or banner for “too many requests” when server returns **429** (may overlap **Cross-cutting — Infrastructure and hardening** global error UX) — **`toastBridge`** + **`warning`** toast from **`httpClient`**; **`SettingsPage`** skips duplicate **`toast.error`**

---

## Prerequisite — User keypair: generate, store, and maintain (before encrypted messaging / Feature 1)

**Order:** Complete this section **before** implementing **ciphertext** in **Feature 1** (if MVP requires E2EE from the first message). If you ship **plaintext** messaging first, still complete this early so Feature 1 can switch to encrypted payloads without rework. Aligns with **Feature 11** (full wire protocol and group wrapping); this prerequisite focuses on **lifecycle** only.

**Key model:** **Private keys client-only**; **one public key per user** on the server (optional `keyVersion` for rotation). See terminology in **Feature 11**.

### Prerequisite — Product direction (E2EE UX)

The **default product** does **not** expose a **Settings** (or similar) screen for **encryption / key backup / rotate / key status**—end users should **not** have to “manage keys” in the UI. Satisfy **`README.md`** and **`docs/PROJECT_PLAN.md` §14** (ECIES-style hybrid encryption, user-level public keys, client-only private keys) and **`docs/PROJECT_PLAN.md`** (opaque message payloads on **Socket.IO** / **RabbitMQ**, server never sees plaintext content) **without** that surface: e.g. **automatic** keypair generation + public-key registration after login, recovery/rotation only via **documented** or **support** paths—not a first-class settings flow. **Chat** UX instead carries a **small, persistent** indicator that **messages are end-to-end encrypted** (see **Feature 1 (B)** and **Feature 11 (B)**). Code that added a Settings encryption block may remain for **dev** or be removed; it is **not** part of the default user journey.

### (A) Infra, backend & deployment

- [x] **Design doc** in `docs/`: algorithms (e.g. ECDH + AES-GCM hybrid, or chosen suite), key sizes, threat model, rotation rules; server never stores private keys — **`README.md`** and **`docs/PROJECT_PLAN.md` §14**
- [x] **MongoDB:** collection shape — `userId` → **public key** material, optional `keyVersion`, `updatedAt`; indexes on `userId`; **no device-level** rows — **`user_public_keys`**, **`UserPublicKeyDocument`**, **`ensureUserPublicKeyIndexes`**
- [x] **OpenAPI:** paths + schemas for key register / rotate / **`GET` by `userId`**
- [x] **Routes + Zod:** implement handlers; **authz** on **`GET`** (e.g. only peers who may message)
- [x] **Validation:** reject malformed keys; max payload size; rate-limit key updates
- [x] **Audit / security:** no private key fields in any schema; structured logs must never print key material
- [x] **Operational:** document user-initiated **rotation** (new version) and impact on decrypting old messages (product decision) — **`README.md`** and **`docs/PROJECT_PLAN.md` §14** §6.3–6.4

### (B) Web-client, UI, tests & state management

- [x] **Generate**: after **authenticated** session exists, generate keypair in-browser via **Web Crypto API** (or audited lib—**libsodium** / WASM if using X25519); **unit tests** with known test vectors only (no real secrets in repo) — **`src/common/crypto/keypair.ts`** (`generateP256EcdhKeyPair`, SPKI/PKCS8 export); **`useGenerateUserKeypair`** gates on **`useAuth().isAuthenticated`**; **`src/common/crypto/keypair.test.ts`** (OpenSSL fixture PKCS8/SPKI vectors + size checks); **`setupTests.ts`** polyfills **`crypto.subtle`** under jsdom
- [x] **Store private key securely**: never send to server; persist **wrapped** private key in **IndexedDB** (or equivalent), optionally encrypted with a key derived from a **user passphrase** (PBKDF2 / Argon2 with secure parameters); document secure-context (HTTPS) requirement — **`src/common/crypto/privateKeyStorage.ts`** (IndexedDB `messaging-client-crypto`), **`privateKeyWrap.ts`** (PBKDF2-SHA256 default **310k** + AES-256-GCM), **`encoding.ts`**, **`secureContext.ts`**; dev-only plaintext store gated by **`import.meta.env.DEV`**; **`README.md`** and **`docs/PROJECT_PLAN.md` §14** §2.1 + **`README.md`** (Configuration section) pointer; Vitest uses **`fake-indexeddb`** + Node **`webcrypto`** in **`setupTests.ts`**
- [x] **Upload public key**: call API to register/update **user-level** public key; handle success/failure and retry; **Redux** slice or `crypto` slice for `keyRegistered`, `keyVersion` — **`usersApi.putMyPublicKey`** / **`rotateMyPublicKey`**; **`retryAsync`** in **`cryptoSlice`** thunks **`uploadPublicKey`** / **`rotatePublicKey`**; **`useRegisterPublicKey`**; store **`crypto`** reducer
- [x] **Maintain** (technical building blocks): **backup** export (encrypted file or documented recovery path); **restore** flow for new browser; **rotate** path → new keypair → **`POST /v1/users/me/public-key/rotate`**; default product rule: **retain old private keys** in a local keyring (**Option A** — **`README.md`** and **`docs/PROJECT_PLAN.md` §14** §6.3–6.4); **`privateKeyStorage`** keyring + **`keyringBackup.ts`**; hooks **`useKeypairStatus`**, **`useKeypairMaintenance`** (backup / restore / rotate), **`getUserPublicKeyById`**, **`registeredPublicKeySpki`** on **`crypto` slice** — no Settings UI (removed)
- [x] **Hooks**: `useKeypairStatus`, `useRegisterPublicKey`, `useRestorePrivateKey` (names illustrative); **`common/hooks`** + unit tests where applicable
- [x] **Remove encryption / key-management UI from Settings** (not part of **`docs/PROJECT_PLAN.md`** — **`settings/`** module is profile/account per **§10.1** layout; E2EE is **automatic / chat / programmatic**, not a Settings surface):
  - [x] **Interim shipped:** production **`SettingsPage`** did not render **`EncryptionSettingsSection`** in non-**`DEV`** builds — previously gated by **`showEncryptionSettingsUi()`** (removed)
  - [x] Remove **`showEncryptionSettingsUi.ts`** and **all** **`EncryptionSettingsSection`** wiring from **`SettingsPage.tsx`** (including **dev** — no encryption block on Settings at all)
  - [x] Delete **`EncryptionSettingsSection.tsx`**, **`EncryptionBackupPrompt.tsx`**, **`EncryptionSetupWizard.tsx`** under **`modules/settings/components/`** (removed from repo — not moved to **`src/dev/`**; programmatic hooks remain in **`common/`**)
  - [x] Remove colocated tests: **`EncryptionSettingsSection*.test.tsx`**, **`EncryptionSetupWizard.test.tsx`**, **`EncryptionBackupPrompt.test.tsx`**, **`SettingsPage.encryptionVisibility.test.tsx`** — **`useKeypairStatus`**, **`useKeypairMaintenance`**, **`useRestorePrivateKey`** remain testable via **`common/`** hooks
  - [x] **Audit** copy and routes: **`grep`** / UI strings so **Settings** has **no** “encryption”, “key backup”, “rotate key”, or fingerprint flows; **`SettingsPage.test.tsx`** stays profile-only — **`modules/settings`** has no matches; **`ROUTES.settings`** → **`SettingsPage`** profile form only; regression test asserts no forbidden substrings in **`SettingsPage`** output
  - [x] **Verify** programmatic E2EE unchanged: **`crypto` slice**, **`ensureUserKeypairReadyForMessaging`**, **`useSendEncryptedMessage`**, optional **`useDevEnsureMessagingKeys`** — **no** import from **`modules/settings`** for key lifecycle — **`grep`** clean; **`keyLifecycleImportPolicy.test.ts`** asserts source files contain no **`modules/settings`** import paths
- [x] **Integration checkpoint:** first encrypted test payload can be sent from **Feature 1** composer with **automatic** key setup (no user “encryption setup” wizard); **dev-only** manual hooks acceptable for bring-up — **`useSendEncryptedMessage`** (`encryptUtf8ToE2eeBody` **E2EE_JSON_V1**, **`ensureUserKeypairReadyForMessaging`** + device-scoped passphrase); **`FollowUpThreadComposer`** requires **`peerUserId`**; optional **`useDevEnsureMessagingKeys`** for bring-up without sending

---

## Feature 1 — One-to-one text messaging

### (A) Infra, backend & deployment

- [x] Depends on **Prerequisite — User keypair** for ciphertext fields and public-key APIs when E2EE is enabled — **`Message.body`** / **`SendMessageRequest.body`** documented as opaque (plaintext or E2EE ciphertext); **`info`** + schema **`description`** in **`docs/openapi/openapi.yaml`** **`0.1.18`**; **`sendMessageForUser`** JSDoc; **`npm run generate:api`** → **`apps/web-client/src/generated/api-types.ts`**
- [x] **MongoDB:** **`conversations`** + **`messages`** collections; indexes per ****`docs/PROJECT_PLAN.md` §14** §2.0** — **`CONVERSATIONS_COLLECTION`** / **`MESSAGES_COLLECTION`**; **`ensureConversationIndexes`** (`id`, partial **`directPairKey`**, **`participantIds` + `updatedAt` + `id`** for list-by-participant); **`ensureMessageIndexes`** (compound **`conversationId` + `createdAt` + `id`**, unique **`id`**); access-pattern table comments in **`conversations.collection.ts`** / **`messages.collection.ts`**; startup in **`index.ts`**
- [x] **`POST /messages`:** **`validateBody`** + service — **lazy-create** direct conversation when **`conversationId`** omitted + **`recipientUserId`** set (**Cross-cutting** — interim REST; **Socket.IO** send — **Send path — Socket.IO (target)**)
- [x] **1:1 messaging — send (Socket.IO) + list (REST):**
  - [x] **Socket.IO send:** client-originated **send** via **Socket.IO** (reuse **`sendMessageForUser`**) — **`src/utils/realtime/socket.ts`** **`message:send`** — **`sendMessageRequestSchema.safeParse`**, **`isMessageSendRateLimited`**, **`sendMessageForUser`**, ack **`messageDocumentToApi`** / **`AppError`** (same contract as **`POST /v1/messages`**)
  - [x] **`GET` conversation messages:** **`listMessages`** — cursor + **`limit`**; authz (**participant** only)
- [x] **Socket.IO — user room join:** on connection auth success call **`socket.join('user:' + userId)`** in the **`connection`** handler (`src/utils/realtime/socket.ts`) — **in-memory on this process only** (**`PROJECT_PLAN.md` §3.2.2**); without this every `io.to('user:<userId>').emit(…)` on this node is a silent no-op (`PROJECT_PLAN.md` §3.2.1)
- [x] **RabbitMQ — publish API:** export a **`publishMessage(routingKey, payload)`** function from **`src/data/messaging/rabbitmq.ts`** so callers can publish without accessing the private `channel` singleton; guard against calling before `connectRabbit` resolves (shared **`connectPromise`** + throws if never connecting)
- [x] **RabbitMQ (1:1) — publish after persist:** in `sendMessageForUser` (`src/data/messages/sendMessage.ts`), after `insertMessage` resolves, call the publish API with routing key **`message.user.<recipientUserId>`** — **one publish per persisted message** (`PROJECT_PLAN.md` §3.2.1)
  - [x] **Sender multi-device echo:** also publish to **`message.user.<senderId>`** (envelope **`{ message, skipSocketId? }`**) so the sender's other sessions get **`message:new`**; **`message:send`** passes **`originSocketId`** → consumer uses **`io.to('user:…').except(skipSocketId).emit`** (same idea as **`socket.to(room)`**)
- [x] **RabbitMQ consumer — wire `io`:** **`setMessagingSocketIoServer(io)`** in **`index.ts`** after **`attachSocketIo`**; cleared on shutdown — **`src/data/messaging/rabbitmq.ts`**
- [x] **RabbitMQ consumer — implement emit:** parse **`message.user.<userId>`** → **`io.to('user:<userId>').emit('message:new', payload)`**; envelope with **`skipSocketId`** uses **`.except(skipSocketId)`**; flat JSON (recipient publish) unchanged; **`ack`** after delivery attempt (`PROJECT_PLAN.md` §3.2)
- [x] **Socket.IO Redis adapter — deprecate / guard:** intended architecture uses **in-memory rooms** + **RabbitMQ** per replica (**`PROJECT_PLAN.md` §3.2.2**), not **`@socket.io/redis-adapter`**. Wiring remains for edge cases; default **`SOCKET_IO_REDIS_ADAPTER=false`** with **startup `warn`** if enabled (**`socket.ts`**), **`README.md`** (Configuration section) + **docker-compose** comments discourage enabling it
- [x] **Integration test / manual checklist:** automated **`npm run test:integration`** (`src/integration/messagingSocket.integration.test.ts`) — A→B **`message:new`**; **one** `publishMessage` to **`message.user.<B>`** plus **one** sender echo to **`message.user.<A>`**; manual two-replica steps in **`README.md` (manual integration steps)**
- [x] **OpenAPI** for messaging: **`docs/openapi/openapi.yaml`** **`0.1.18`** — **`Message`**, **`SendMessageRequest`**, **`GET/POST` messaging**, **`GET /conversations/{id}/message-receipts`** + **`message:new`** / Socket.IO narrative; **`429`** for rate limits; **`npm run generate:api`** in **`apps/web-client`**
- [x] If shipping **Feature 12** in the same release as Feature 1, add **receipt-related** fields to the message schema early; otherwise **Feature 12** may introduce a migration — **done:** **`MessageDocument.receiptsByUserId`** + **`MessageReceiptEntry`** in **`messages.collection.ts`** (optional on insert; receipt updates use **`$set`** on nested paths — **no** backfill migration for existing rows); **`conversation_reads`** + indexes at Feature 12 — see **Feature 12 (A)** MongoDB line

### (B) Web-client, UI, tests & state management

- [x] **Tests first (`*.tsx`):** conversation **list** row; **thread** message list; **composer** — RTL per ****`docs/PROJECT_PLAN.md` §14** §4.1.1** — **`ConversationListRow.test.tsx`**, **`ConversationList.test.tsx`** (empty / loading / error), **`ThreadMessageList.test.tsx`** (empty / loading / error + log), **`ThreadComposer.test.tsx`** (send + errors); **no** demo preview on **`HomePage`**
- [x] **UI — shell:** conversation list layout + active selection state
- [x] **UI — thread:** scroll container, message bubbles, timestamps
- [x] **UI — composer:** text input, send button, disabled/loading
- [x] **Redux:** active **`conversationId`**, normalized **`messagesByConversationId`**, send **pending/error** flags
- [x] **`useConversation` / `useSendMessage`:** call **`listMessages`** (REST or future read path); **send** via **Socket.IO** (**not** HTTP **`POST /messages`** for primary UX — **Send path — Socket.IO (target)**) + optimistic updates
- [x] **Socket.IO — receive:** listen for **`message:new`** events (emitted by the RabbitMQ consumer via `io.to('user:<userId>')`) in the **`socketWorker`** / **`socketBridge`**; dispatch to Redux; **dedupe** by **`messageId`** before rendering (`PROJECT_PLAN.md` §3.2.1)
- [x] **Optimistic vs server:** reconcile temp ids with server **`Message.id`**
- [x] **Loading / empty / error** states; **chat** **`role="log"`** / **`aria-live`** where appropriate
- [x] **E2EE messaging indicator (product):** small, non-blocking component in the **chat / thread** area (e.g. near composer or thread header) that states messages are **end-to-end encrypted**, consistent with **`docs/PROJECT_PLAN.md`** (opaque payloads on real-time path; server routing without content visibility) and **`README.md`** and **`docs/PROJECT_PLAN.md` §14** (hybrid / ECIES, user-level keys). **No** reliance on a **Settings → encryption** screen. **Tests first** (`*.tsx`) per ****`docs/PROJECT_PLAN.md` §14** §4.1.1**
- [ ] **Sent tick** (stub) or full **Feature 12** receipts when ready

---

## Feature 2 — Sign up / log in with email and password _(email verification optional via env)_

**Default (demo):** **`EMAIL_VERIFICATION_REQUIRED=false`** — new users get **`emailVerified: true`** on register; no mail. **`User.emailVerified`** stays on the model for all modes.

**Planned:** **`emailVerificationRequired`** moves to **MongoDB** runtime config — see **Cross-cutting — Runtime configuration (MongoDB)** (env remains bootstrap/fallback until migrated).

### (A) Infra, backend & deployment

- [ ] **Email verification toggle (DB):** implement **`emailVerificationRequired`** from **MongoDB** config document; **deprecate** env-only **`EMAIL_VERIFICATION_REQUIRED`** for runtime decisions once migration exists (keep env as **default seed** / **fallback**) — ties to **Cross-cutting — Runtime configuration (MongoDB)**
- [x] User schema: **`users`** collection — unique indexes on **`email`** + **`id`**; **`passwordHash`** (**Argon2id** via **`argon2`**); **`profilePicture`**, **`status`**, **`displayName`**, **`emailVerified`**, **`lastSeenAt`** — see **`src/data/users/`** + **OpenAPI** `User` — **keep `emailVerified`** (do not remove)
- [x] Registration + **`POST /auth/verify-email`** + **`POST /auth/resend-verification`** + verification JWTs — **`src/routes/auth.ts`**
- [x] **`EMAIL_VERIFICATION_REQUIRED`** (boolean, default **`false`**) — **`apps/messaging-service/src/config/env.ts`**
- [x] Document **`EMAIL_VERIFICATION_REQUIRED`** — **`README.md`** (Configuration section) + **`infra/.env.example`** (+ Compose)
- [x] When **`EMAIL_VERIFICATION_REQUIRED=false`:** **`POST /auth/register`** sets **`emailVerified: true`**; **`/auth/verify-email`** + **`/auth/resend-verification`** return **400** **`EMAIL_VERIFICATION_DISABLED`** (**`README.md` (Configuration)**)
- [x] When **`EMAIL_VERIFICATION_REQUIRED=true`:** **`POST /auth/register`** sets **`emailVerified: false`**
- [x] **SendGrid path:** **`SENDGRID_API_KEY`** + **`EMAIL_FROM`** + **`PUBLIC_APP_BASE_URL`** — **`src/email/sendVerificationEmail.ts`**; verification mail on register; **`resend`** returns **503** if SendGrid throws
- [x] **`verify-email` / `resend-verification`:** JWT validation + **Redis** rate limits (per route)
- [x] **Auth middleware / protected routes:** **`user.emailVerified === true`** only when **`EMAIL_VERIFICATION_REQUIRED`** is **`true`** — **`requireAuthenticatedUser`** / **`requireAuthMiddleware`** (`src/middleware/requireAuth.ts`); **`requireUploadAuth`** for **`POST /v1/media/upload`**
- [x] JWT access + refresh; login/logout/revocation; optional password reset — **`issueAuthTokens`**, Redis refresh tokens + **`refreshTokenVersion`** (`src/utils/auth/issueTokens.ts`, **`refreshTokenRedis.ts`**); **`POST /auth/refresh`**, **`/auth/logout`**; **`/auth/forgot-password`** + **`/auth/reset-password`** (signed JWT + **`setUserPasswordAndBumpVersion`**); OpenAPI **0.1.6**
- [x] **OpenAPI `0.1.4`** — **`/auth/register`**, **`/auth/verify-email`**, **`/auth/resend-verification`**; **`RegisterRequest`** optional **`profilePicture`** + **`status`**; **`PATCH /users/me`** — **`UpdateProfileRequest`** (**`0.1.1`**); **Zod** on auth bodies; login/refresh middleware still **[ ]**

### (B) Web-client, UI, tests & state management

- [x] **Register flow:** form + **`registerUser`** + **`applyAuthResponse`**; optional **`status`** + **`profilePicture`** (file → **`PATCH /users/me`** or advanced URL in **`RegisterRequest`**); errors from **`ErrorResponse`** — **`RegisterPage`**, **`routes/paths`**, **`modules/auth/utils/apiError`**
- [x] **Register — profile picture (UX):** **file** input primary (**`accept`** image/\*, **`REGISTER_AVATAR_MAX_BYTES`**); after **`registerUser`** when **`accessToken`** present, **`PATCH /users/me`** via **`updateCurrentUserProfile`** (same **`SettingsPage`** S3 path); optional **URL** in **advanced** **`details`**; toasts when photo cannot be applied until **Settings** — **`RegisterPage`**, **`formValidation`**
- [x] **Login flow:** form + **`login`** + **`applyAuthResponse`**; handle **403** “email not verified” vs **401** — **`LoginPage`**, **`parseLoginError`** in **`modules/auth/utils/apiError`**
- [ ] **Forgot / reset password** _(deprioritized for now — backend routes exist; web-client screens later):_ **`forgotPassword`** + **`resetPassword`** (token from **email link** / query param)
- [x] **Verification UX when `User.emailVerified` is `false`:** **`verifyEmail`** + **`resendVerificationEmail`** screens (state from register or **`getCurrentUser`**) — **`VerifyEmailPage`**, **`ROUTES.verifyEmail`**, **`applyVerifyEmailResponse`**
- [x] **Redux `auth`:** ensure **`user.emailVerified`** populated; after register, route to app vs “check your email” — **`selectEmailVerified`**, **`useAuth`**, **`RegisterPage`** / **`HomePage`** redirect to **`/verify-email`** when unverified
- [x] **Protected routes:** wrapper or loader — unauthenticated → **`/login`**; post-login redirect — **`ProtectedRoute`**, **`postLoginRedirect.ts`**, **`App.tsx`** nested route; login/register/verify preserve **`state.from`**
- [x] **Session restore:** on app load, **`getCurrentUser`** (or refresh) if refresh token present — **`main`/`App`** bootstrap — **`SessionRestore`**, **`sessionBootstrap.ts`** (**`refreshTokens`** → **`getCurrentUser`**)
- [x] **Settings / profile:** **`PATCH /users/me`** via **`updateCurrentUserProfile`** (FormData: image + **status** + **displayName**) — **`SettingsPage`**, **`ROUTES.settings`**
- [x] **Tests first (`*.tsx`):** one screen per test file or shared **`renderWithProviders`** — RTL + MSW per ****`docs/PROJECT_PLAN.md` §14** §4.1.1** — **`src/common/test-utils/renderWithProviders.tsx`**, **`src/common/mocks/handlers.ts`** + **`server`**, **`SettingsPage.test.tsx`**, **`HomePage.test.tsx`**, **`src/common/components/ThemeToggle.test.tsx`**
- [x] **Form validation UX** (client) + **API** error mapping (`code` / `message`) — **`lib/formValidation.ts`**, **`parseApiError`** / **`ApiErrorAlert`**, auth + **`SettingsPage`**

---

## Feature 2a — Guest / try-the-platform (temporary access)

**Goal (demo / playground):** Instead of shared demo passwords, visitors **enter a display name only** and receive **temporary access** to **message other users** on the system and explore the product. **Product rules (locked):** **`README.md`** / **`docs/PROJECT_PLAN.md`** (guest rules) — _update doc on implementation:_ **30 min** session + refresh, rate limits, search + DM to registered users, **no settings** / admin / password / billing. **Guest access** **on/off** via **`guestSessionsEnabled`** in **MongoDB** (see **Cross-cutting — Runtime configuration (MongoDB)**), not env-only. Open items (e.g. groups / calls) remain in checklist.

### (A) Infra, backend & deployment

- [x] **Product rules:** Document guest **TTL**, **rate limits**, and **who guests can message** (and what is blocked: e.g. admin, password change, billing) — ****`README.md`** / **`docs/PROJECT_PLAN.md`** (guest rules)**
- [ ] **Guest enable/disable (DB):** enforce **`guestSessionsEnabled`** from **MongoDB** runtime config — reject **`POST /auth/guest`** when disabled — **Cross-cutting — Runtime configuration (MongoDB)**
- [ ] **Session + refresh TTL (30 minutes):** **access token** lifetime **30 minutes**; issue a **refresh token** for guests with **30 minutes** validity (Redis TTL / stored expiry aligned); document in OpenAPI + **`docs/PROJECT_PLAN.md`** and **`README.md`** + **`README.md`** (Configuration section) when vars exist
- [ ] **OpenAPI + Zod:** e.g. **`POST /v1/auth/guest`** — body **`{ displayName }`**; response **`accessToken`**, **`refreshToken`**, **`user`** (or public profile), **`expiresAt`**; **`guest: true`** (or equivalent) in **`User`** / token claims — bump spec + **`generate:api`** in same PR as routes.
- [ ] **Persistence:** Guest identity — either rows in **`users`** with **`isGuest: true`** + nullable **`email`**, or a dedicated **`guest_sessions`** / **`users`** slice; indexes + optional **MongoDB TTL** on session documents.
- [ ] **JWT:** Access + refresh for guests (**30 min** each, per above) with **`guest`** claim; align with **Feature 2** token shape so one **auth middleware** can branch **guest vs full user**; **`POST /auth/refresh`** for guest refresh tokens within validity window
- [ ] **Rate limits:** Per **IP** (and optionally per **fingerprint** header) on **`POST /auth/guest`**; abuse caps on sends for guest **`userId`**.
- [ ] **AuthZ:** Apply guest rules on **REST** and **Socket.IO** (join rooms, **message send** (target: **Socket.IO** — **Send path — Socket.IO (target)**), search) — guests cannot escalate to full account actions until they **register**.
- [ ] **Lifecycle:** Clear behaviour on expiry (401 + client redirect to name screen); optional **“Continue as guest”** re-issue with same display name policy (collision handling: suffix, uniqueness window).

### (B) Web-client, UI, tests & state management

- [ ] **Entry UX:** **“Try the app”** / **Continue as guest** — single field **display name** (validation: length, profanity optional) → call **`POST /auth/guest`** → store token + user in **`auth`** slice (**Feature 2**).
- [ ] **Discoverability:** From landing, guest path sits **beside** sign-up / login; no email verification for guests.
- [ ] **Session UI:** Persistent **banner** — _You’re using a temporary guest session_ — link to **Create account**; show **time remaining** if API exposes **`expiresAt`**.
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

- [x] **Search input is email** (not internal user id): **`GET /v1/users/search?email=`** — returns **`UserSearchResult`** ( **`displayName`**, **`profilePicture`**, **`userId`**, **`conversationId`** nullable)
- [x] **MongoDB + limits:** unique index on **`email`** (exact lookup — **`users_email_unique`**); **Redis** per-IP rate limits on search (**`USER_SEARCH_RATE_LIMIT_*`**)
- [x] **Privacy (MVP):** **exact match** only — **no** prefix/typeahead (enumeration risk); extended discoverability rules TBD
- [x] **OpenAPI** — **`/users/search`** + **`UserSearchResult`** + **`429`**; **`README.md`** (Configuration section) — **User search policy**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first (`*.tsx`):** debounced **`searchUsersByEmail`**; loading → results; empty state
- [ ] **Search field:** controlled input, debounce, **`searchUsersByEmail`** via **`usersApi`**
- [ ] **Results list:** **name**, **avatar**, **`conversationId`** hint; navigate to composer / existing thread
- [ ] **State:** local **`useState`** or small Redux slice for results + **`isLoading`**
- [ ] **a11y:** keyboard navigation, **`aria`** on listbox / options

---

## Feature 6 — Last seen per user

**Distinction from Feature 12:** **Last seen** is **user presence** (last app activity). **Message “seen” / read receipts** are **per-message** state — **independent** pipelines; see **`docs/PROJECT_PLAN.md` §14**.

**Algorithm (locked):** While Socket.IO is connected, the **client** sends **`presence:heartbeat` every 5 seconds**; **messaging-service** stores the timestamp in **Redis** (`presence:lastSeen:{userId}`, TTL **`LAST_SEEN_TTL_SECONDS`**). When the **Socket.IO connection closes**, the service **writes that last-seen time to MongoDB** (`users.lastSeenAt` for `users.id === userId`) and **removes** the Redis key. _No_ Redis update on connect alone—only heartbeats.

### (A) Infra, backend & deployment

- [x] **Redis (hot / online):** accept **`presence:heartbeat`**; update Redis at most once per **~4.5s** per socket (throttle); **`src/presence/lastSeen.ts`**
- [x] **MongoDB (durable / offline):** on **disconnect**, **`flushLastSeenToMongo`** — copy Redis timestamp → **`users.lastSeenAt`**, then **`DEL`** Redis key; **`src/presence/flushLastSeenToMongo.ts`**
- [x] **Read path (WebSocket):** client emits **`presence:getLastSeen`** with **`{ targetUserId }`** and uses the **ack** callback — server: **Redis first**, then **`users.lastSeenAt`** in MongoDB, else **`{ status: 'not_available' }`** (`resolveLastSeenForUser`)
- _Deprioritized — not required for now:_ **Authz on `targetUserId`** for **`presence:getLastSeen`** (optional **REST** mirror in **OpenAPI**) — revisit with **Feature 2** when privacy policy needs it.
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
- [ ] **Persist + RabbitMQ:** one broker publish per group message to routing key **`message.group.<groupId>`** (never one publish per member); RabbitMQ consumer resolves room **`group:<groupId>`** → `io.to(room).emit('message:new', payload)`; pagination for message list; **delivery/read receipt** behaviour per **Feature 12** (`PROJECT_PLAN.md` §3.2.1)
- [ ] **Socket.IO — group room join on connect:** on authentication in the `connection` handler, look up all groups the user belongs to and call **`socket.join('group:' + groupId)`** for each — without this, group-scoped emits never reach the socket (`PROJECT_PLAN.md` §3.2.1)
- [ ] **Socket.IO — membership sync (join/leave):** when a user is added to or removed from a group (via the groups API), find every active socket for that user and call **`socket.join`** / **`socket.leave`** on the `group:<groupId>` room so room membership stays in sync with group membership; do not rely on reconnection to fix stale rooms (`PROJECT_PLAN.md` §3.2.1)
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
- [ ] **Operational**: user-level key rotation policy; **documented** recovery for **new browser / lost local storage** (restore from backup — not a server “device” concept); **no** requirement for a user-facing **Settings** backup UI (see **Prerequisite — Product direction**)

### (B) Web-client, UI, tests & state management

- [ ] **Crypto module** (`web-client`): use **Web Crypto API** and/or audited library (e.g. libsodium via WASM); **unit tests** for encrypt/decrypt/sign/verify helpers (vectors, no real private keys in repo); extend helpers built in **Prerequisite — User keypair** as needed for message payloads
- [ ] **Key lifecycle (non-Settings):** production needs met **without** a **Settings → encryption** flow—automatic or silent key registration, backup/rotate only where **documented** or **support**, not as primary UI; **message-thread** inline states only when needed (e.g. “cannot decrypt”)—not rotation banners in **Settings**
- [x] **1:1 flow**: before send, fetch recipient’s **user-level** public key (cached in Redux), encrypt (hybrid per **`README.md`** and **`docs/PROJECT_PLAN.md` §14**), send ciphertext; on receive, decrypt with local private key; handle missing/wrong keys with **inline** / thread-level UX if needed
- [ ] **Group flow**: for each outgoing group message, build content key, encrypt message, wrap key for **each current member’s** public key (per design in (A)); on receive, unwrap and decrypt; handle member add/remove vs key rotation
- [ ] **Redux / hooks**: `usePublicKey`, `useEncryptMessage`, `useDecryptMessage`; cache peers’ public keys with invalidation on rotation
- [ ] **Tests first** (`*.tsx`): **E2EE indicator** in chat (see **Feature 1 (B)**); any “encryption unavailable” or decrypt-failure UI in **thread** context—not **Settings**

---

## Feature 12 — Sent, delivered, and seen (read receipts / ticks)

**Scope:** Per-message (or per-conversation cursor) **delivery** and **read** state so the UI can show **sent** → **delivered** → **seen** indicators (e.g. tick icons). **Build after Feature 1** (and **Feature 8** for groups) can create and list messages.

**Semantics (define in `docs/`):** **Sent** — server accepted and stored the message. **Delivered** — recipient’s client acknowledged receipt (at-least-once to their device/session). **Seen** — recipient has read the message (e.g. conversation open / read cursor past that `messageId`). Group chats may use per-member delivery/read maps or a simplified “read up to” cursor per member — see **`docs/PROJECT_PLAN.md` §14**.

### (A) Infra, backend & deployment

- [x] **Design doc**: 1:1 vs group representation (`deliveredAt` / `seenAt` fields vs per-recipient maps vs `lastReadMessageId` per user per conversation); privacy (e.g. disable read receipts setting — optional follow-up) — **`docs/PROJECT_PLAN.md` §14**
- [x] **MongoDB**: extend message or receipt sub-documents with timestamps or user→timestamp maps; indexes for querying latest receipt state; access patterns per **`docs/PROJECT_PLAN.md` §14** §2.0 — **`messages.receiptsByUserId`**, **`conversation_reads`** (`ensureConversationReadsIndexes`, **`conversation_reads.collection.ts`** + **`repo.ts`**)
- [x] **Socket.IO** (and **RabbitMQ** if cross-node): events such as `message:delivered`, `message:read` / `conversation:read` with `messageId`, `conversationId`, `userId`; idempotent handlers; fan-out to sender and relevant peers — **`receiptSocketHandlers.ts`**, **`message.receipt.<userId>`** routing keys, **`messageReceiptOps`**, **`receiptPublish.ts`**, Redis **`MESSAGE_RECEIPT_RATE_LIMIT_*`**
- [x] **REST** (optional): fetch receipt summary for history sync; align with **OpenAPI** — **`GET /v1/conversations/{conversationId}/message-receipts`** (`listMessageReceipts`), **`MessageReceiptPage`**, receipts **removed** from **`Message`**
- [x] **Ordering**: define how **seen** interacts with **last seen** (Feature 6) — related but distinct (message-level vs user presence) — **`docs/PROJECT_PLAN.md` §14**
- [x] **Rate limits** on receipt floods; no PII in logs — **`MESSAGE_RECEIPT_RATE_LIMIT_*`** + **`isMessageReceiptRateLimited`**

### (B) Web-client, UI, tests & state management

- [x] **Tests first** for **ReceiptTicks** (or similar) presentational component: states **sent**, **delivered**, **seen** (and loading/unknown)
- [x] **Outbound**: after send succeeds, show **sent**; on server/event confirmation, advance state as designed
- [x] **Inbound**: on message received, emit **delivered** ack to server; when user opens thread or message enters viewport (product choice), emit **seen** / read cursor
- [x] **Redux**: merge receipt updates into message entities or normalized `receiptsByMessageId`; selectors for tick state per bubble
- [x] **Group UI**: show aggregate or per-member policy (e.g. all delivered / all seen) per design doc
- [x] **Accessibility**: ticks not sole indicator — optional `aria-label` on status
- [ ] **Feature flags** (optional): hide seen/delivered if user setting disables receipts later

---

## Cross-cutting — Media (AWS S3)

**Scope:** **Static assets** uploaded by users (e.g. **images** in chat). **All S3 access uses the AWS SDK in messaging-service** (`@aws-sdk/client-s3`, and **`@aws-sdk/lib-storage`** if large/multipart uploads). The **web-client** sends files **to messaging-service** only (**no AWS SDK** and **no AWS credentials** in the browser).

### (A) messaging-service (backend) — AWS SDK

- [x] Dependencies: **`@aws-sdk/client-s3`**; **`@aws-sdk/lib-storage`** (`Upload`); **do not** add AWS SDK to **web-client**
- [x] **S3 client factory:** `src/storage/s3Client.ts` — env from **`README.md`** (Configuration); **MinIO** (`S3_ENDPOINT`, path-style when endpoint set); credentials via env or IAM default chain on AWS
- [x] **Upload path:** **`POST /v1/media/upload`** — multipart **`file`**; **`Authorization: Bearer`** (HS256, `sub`) when **`JWT_SECRET`** set; non-production **`X-User-Id`** for local dev; **conversation-level authz** can be added with messaging (**Feature 1**)
- [x] **Before calling SDK:** **`MEDIA_MAX_BYTES`** (default **30 MiB** via env); allowlisted **MIME** (images + common video types); keys `users/{userId}/{uuid}-{name}`; in-memory buffer up to max (stream to **`Upload`** later if needed)
- [x] **AWS SDK:** **`Upload`** from `@aws-sdk/lib-storage`; response **`{ key, bucket, url? }`** per **OpenAPI** `MediaUploadResponse`
- [ ] **MongoDB:** message (or attachment) documents store **S3 key** (and optional public/base URL); access patterns per **`docs/PROJECT_PLAN.md` §14** §2.0
- [x] **Operational:** **`HeadBucket`** on **`/v1/ready`** when S3 configured; **`ensureBucketExists`** at startup; **Compose** wires **MinIO** + **`S3_*`** env (see **`infra/docker-compose.yml`**)

### (B) Web-client (UI) — upload via API only

- [ ] **Tests first (`*.tsx`):** MSW **`POST /media/upload`** → progress callback → resolved **`MediaUploadResponse`**
- [ ] **File picker + FormData:** **`file`** field per OpenAPI; **`uploadMedia`** (**`mediaApi.ts`**)
- [ ] **Progress + cancel:** **`axios` `onUploadProgress`** or XHR; **`AbortController`** for cancel; retry UX
- [ ] **Composer:** after upload, pass **`mediaKey`** / preview URL into **`sendMessage`** — **no** browser **S3** calls
- [ ] **`useMediaUpload` hook:** percent + error state (**no** `aws-sdk` in **`package.json`**)
- [ ] **Thread:** **`<img>`** from API/CDN URLs; **`loading="lazy"`**; **`alt`**; optional lightbox
- [ ] **Env / CDN:** **`VITE_API_BASE_URL`** in **`README.md`** (Configuration section); public **bucket/CDN** base URL for **`src`** if different from API origin

---

## Cross-cutting — Infrastructure and hardening

### (A) Infra, backend & deployment

- [ ] Metrics + health for **messaging-service**; structured logs; optional OpenTelemetry
- [ ] Rate limits (see **Cross-cutting — Global rate limiting** for **500/min** per-IP app-level plan), audit logs, secrets management, backups, load tests, runbooks

### (B) Web-client, UI, tests & state management

- [ ] Global error boundary + user-friendly API error mapping (Redux middleware or hook)
- [ ] Optional: client-side analytics hooks; performance budgets for bundle size

---

## Manual full-system test checkpoints

Run these when you want to exercise the **whole stack** (Compose, nginx, **messaging-service**, **web-client**, MongoDB, Redis, RabbitMQ, MinIO, optional coturn). Use **after** major merges, **before** demos, or when debugging cross-cutting issues. (Automate later if useful.)

- [ ] **Compose bring-up:** `docker compose -f infra/docker-compose.yml up -d --build` — `docker compose ps` shows expected containers; **`README.md`** host/port match your test.
- [ ] **HTTP health:** **`GET /v1/health`** and **`GET /v1/ready`** via nginx entry (e.g. **`http://localhost:8080`**) — **200** when dependencies are up; **`/v1/ready`** reflects MongoDB, Redis, RabbitMQ, S3 as configured.
- [ ] **Swagger:** **`/api-docs`** loads; spot-check a **public** route, then **Authorize** with a Bearer token and hit a protected route.
- [ ] **Web client:** `npm run dev` in **`apps/web-client`** _or_ static **`dist/`** behind nginx — app shell loads; browser **Network** tab shows API calls to expected **`VITE_API_BASE_URL`** / proxy.
- [ ] **Auth path:** register + login **or** login only — session survives refresh (refresh token); **logout** clears client storage as designed; optional: **`EMAIL_VERIFICATION_REQUIRED=true`** path documented in **`README.md` (Configuration)**.
- [ ] **Socket.IO:** client reaches **connected** (UI or worker); no repeated **401** loops; **presence:heartbeat** only if **Feature 6** path is enabled.
- [ ] **Quality gates:** `npm run lint` + `npm run typecheck` in **`apps/web-client`** and **`apps/messaging-service`** (and **`npm run test`** where UI **`*.tsx`** tests exist).

When **Feature 1** messaging and later features land, also run the **Definition of done (MVP smoke)** bullets below end-to-end.

---

## Definition of done (MVP smoke)

- [ ] **`docker compose`** brings up **messaging-service** + deps per **`README.md`**
- [ ] **nginx** serves **web-client** **`dist/`** + proxies API (or documented equivalent)
- [ ] **TLS** documented for production (even if local dev stays HTTP)
- [ ] **OpenAPI** in repo; **`npm run generate:api`** in **web-client**; **Swagger** at **`/api-docs`**
- [ ] **Redux** + typed hooks per ****`docs/PROJECT_PLAN.md` §14****
- [ ] **Smoke — auth:** register → login ( **`EMAIL_VERIFICATION_REQUIRED=false`** default; separate smoke if **`true`** )
- [ ] **Smoke — messaging:** 1:1 thread send/receive; optional **group** create + message
- [ ] **Smoke — media:** upload + attach in thread
- [ ] **Smoke — notifications:** in-tab **`notification`** event for a message (or stub)
- [ ] **Smoke — call:** 1:1 call happy path (or documented skip)
- [ ] **Feature 2a (optional):** guest path → message per policy
- [ ] **Socket.IO** status visible (**connecting** / **connected** / **disconnected**)
- [ ] _(If E2EE in scope)_ **User keypair** prerequisite + **Feature 11** wire + ciphertext on wire/at rest; **Feature 1 (B)** **E2EE messaging indicator** in chat (not Settings)
- [ ] _(If receipts in scope)_ **Feature 12** **sent** / **delivered** / **seen** end-to-end

---

_Checklist version: 7.1 — **Real-time `message:new` delivery** + **read-receipt dedupe** tasks under **Product polish / UX backlog**._
