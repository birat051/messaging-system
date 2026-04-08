# Messaging Platform — Task Checklist

Use this checklist to track implementation progress. Sections align with [PROJECT_PLAN.md](./PROJECT_PLAN.md).

**Pattern:** For each feature or cross-cutting area below, work is split into **(A) Infra, backend & deployment** and **(B) Web-client, UI, tests & state management** (Redux, hooks, test-first components per `PROJECT_GUIDELINES.md`). **Prerequisite — User keypair** runs before encrypted **Feature 1** work when E2EE is required.

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

- [ ] **messaging-service (S3 / static uploads)** — **AWS S3** (or **S3-compatible**, e.g. **MinIO**) for **user-uploaded static assets**; uploads go **through messaging-service** using the **AWS SDK** (`PutObject` / managed upload), not direct browser→S3; object keys stored on messages per **`PROJECT_PLAN.md`**; full subtasks in **Cross-cutting — Media (AWS S3)**

- [ ] **Docker Compose, nginx, TLS, deployment**
  - [x] **`docker compose`**: **`infra/docker-compose.yml`** — **messaging-service** (image build), MongoDB, Redis, RabbitMQ, MinIO, **nginx** (entry **`http://localhost:8080`**); optional **coturn** — `docker compose -f infra/docker-compose.yml --profile turn up -d`
  - [x] nginx: reverse-proxy REST + **Socket.IO** to **messaging-service** with upgrade headers (`infra/nginx/nginx.conf`); *pending:* serve **`apps/web-client/dist/`** as static root, TLS, production WebRTC hardening
  - [x] Document hostnames, ports, one-command bring-up — root **`README.md`**, **`infra/.env.example`**

### (B) Web-client, UI, tests & state management

- [ ] **web-client (skeleton)**
  - [x] Scaffold with **Vite** + **React** + **TypeScript** under `apps/web-client` — **`tsconfig.json`** project references + **`tsconfig.app.json`** / **`tsconfig.node.json`**; **`vite.config.ts`**, **`index.html`**, **`src/main.tsx`**, **`eslint.config.mjs`**, **`.prettierrc.json`** — all **inside `apps/web-client` only**
  - [x] Strict TS (`tsconfig.app.json` — `strict`, unused locals/params, etc.) per `PROJECT_GUIDELINES.md` §1.1
  - [x] **Tailwind CSS v4** + **themes** — **`@tailwindcss/vite`**, **`tailwind.config.ts`**, semantic tokens + **`@theme`** in **`src/index.css`** (`background`, `foreground`, `surface`, `accent`, `border`, `muted`, `ring`, `radius-card`, `shadow-card`); **class-based dark mode** (`html.dark`) + **`ThemeProvider`** / **`useTheme`** / **`ThemeToggle`** + **`localStorage`** (`messaging-theme`); `prettier-plugin-tailwindcss` in **`.prettierrc.json`**
  - [x] **ESLint** (`typescript-eslint`, **`eslint-plugin-react-hooks`**, **`eslint-plugin-react-refresh`**); **Prettier**; optional a11y plugin later
  - [ ] **react-router**, API base URL from env, **`socket.io-client`** (run in a **dedicated Web Worker** per `PROJECT_PLAN.md` §3.3; `postMessage` to main thread); **`emit('presence:heartbeat')` every 5s** while the socket is connected (**Feature 6**), **`dist/`** ready for nginx
  - [ ] **Static assets / uploads (images, etc.):** follow **Cross-cutting — Media (AWS S3)** — **multipart (or binary) upload to messaging-service**, progress UX, composer UI, attachment rendering (**no AWS SDK in the browser**)

- [ ] **Redux and client architecture**
  - [ ] `@reduxjs/toolkit`, `react-redux`, typed `useAppDispatch` / `useAppSelector`, `configureStore` + middleware extension points
  - [ ] Feature slices (e.g. auth shell); `<Provider>` with router; `hooks/` for composed logic (`useAuth`, etc.); document middleware vs thunks vs components (`PROJECT_GUIDELINES.md` §4.3)

- [ ] **Connection status UI**
  - [ ] **Connecting** / **connected** / **not connected** from **Socket.IO** lifecycle; Redux or hook; **tests first** for status component

---

## API specification (OpenAPI) and Swagger UI — *complete before REST feature work*

### (A) Infra, backend & deployment

- [x] Author **OpenAPI 3** spec under **`docs/openapi/`** (e.g. `openapi.yaml`): resources, schemas, Bearer JWT, errors, pagination; tags; `/v1`
- [x] **Spec bump `0.1.0`:** user **`profilePicture`** + **`status`**; **`GET /users/search?email=`** + **`UserSearchResult`** (name, avatar, **`conversationId`** nullable); **`POST /messages`** with optional **`conversationId`** + **`recipientUserId`** for new direct threads; **`LimitQuery`** default documented — see **Cross-cutting — User profile, email search, send message, pagination**
- [x] **Spec bump `0.1.1`:** **`RegisterRequest`** — optional **`profilePicture`** (URI) + **`status`** at signup; **`PATCH /users/me`** — **`multipart/form-data`** **`UpdateProfileRequest`** (optional **`file`**, **`status`**, **`displayName`**) — see **Feature 2** + **Cross-cutting**
- [ ] **messaging-service:** validate requests with **Zod** (or equivalent) matching the spec; same PR when routes change
- [x] Serve **Swagger UI** from **messaging-service** (`swagger-ui-express`) at **`/api-docs`**; works in Docker Compose / local dev; URL documented in root **`README.md`** and **`OPENAPI_SPEC_PATH`** in **`docs/ENVIRONMENT.md`**
- [ ] Optional: restrict Swagger to non-prod or auth
- [ ] Process: update OpenAPI in same PR as route changes (`PROJECT_GUIDELINES.md` §3)

### (B) Web-client, UI, tests & state management

- [x] Document in README how frontend devs open Swagger (URL, port)
- [x] **web-client:** **openapi-typescript** wired (`generate:api`); contract at **`docs/openapi/openapi.yaml`**

---

## Cross-cutting — User profile, email search, send message, pagination

**Contract:** **`docs/openapi/openapi.yaml`** **v0.1.1** — regenerate **`apps/web-client`** with **`npm run generate:api`** when the spec changes.

### (A) Infra, backend & deployment

- [ ] **User document (`users`):** include **`profilePicture`** (nullable URL / CDN) and **`status`** (short nullable string) per **`User`** / **`UserPublic`**; migrations if collections already exist
- [ ] **Signup (`POST /auth/register`):** accept optional **`profilePicture`** (URI, e.g. after **`POST /media/upload`**) and **`status`** — optional JSON fields per **`RegisterRequest`** (`0.1.1`)
- [ ] **Update profile (`PATCH /users/me`):** **`multipart/form-data`** with optional **`file`** (profile image), **`status`**, **`displayName`** — at least one part; persist image via S3 / same pipeline as media upload; return **`User`**
- [ ] **Search by email (not user id):** implement **`GET /v1/users/search?email=`** — returns **`UserSearchResult[]`**: **`userId`**, **`displayName`**, **`profilePicture`**, **`conversationId`** (direct 1:1 with caller if it already exists, else `null`) — rate limits + privacy rules (**Feature 5**)
- [ ] **Send message — optional `conversationId`:** implement **`POST /v1/messages`** — if **`conversationId`** omitted for a **new direct 1:1**, require **`recipientUserId`**; server **creates conversation** then **message**; for follow-up and group sends, client passes **`conversationId`** (omit **`recipientUserId`**) — **Feature 1**
- [ ] **Paginated list APIs:** **`limit`** query param **optional** everywhere; **server default** when omitted (see **`LimitQuery`**, default `20`); enforce max cap in handlers
- [ ] **Implementation order:** update **OpenAPI** first (done through **`0.1.1`**), then **Zod** + routes + **MongoDB** writes in same PR where possible

### (B) Web-client, UI, tests & state management

- [ ] **Profile:** **`PATCH /users/me`** — **`FormData`** with **image** file + **status** + **displayName**; **signup** may include optional **`profilePicture`** URL + **`status`** (after **`POST /media/upload`** if needed) per **`RegisterRequest`**
- [ ] **Search UX:** query by **email**; results show **name**, **avatar**, and whether a **conversation** already exists (**`conversationId`**) before opening composer
- [ ] **Composer / send:** first message to a user **without** `conversationId` — send **`recipientUserId`** from search; persist returned **`conversationId`** from **`Message`**; subsequent messages **always** include **`conversationId`** when known

---

## Prerequisite — User keypair: generate, store, and maintain (before encrypted messaging / Feature 1)

**Order:** Complete this section **before** implementing **ciphertext** in **Feature 1** (if MVP requires E2EE from the first message). If you ship **plaintext** messaging first, still complete this early so Feature 1 can switch to encrypted payloads without rework. Aligns with **Feature 11** (full wire protocol and group wrapping); this prerequisite focuses on **lifecycle** only.

**Key model:** **Private keys client-only**; **one public key per user** on the server (optional `keyVersion` for rotation). See terminology in **Feature 11**.

### (A) Infra, backend & deployment

- [ ] **Design doc** in `docs/`: algorithms (e.g. ECDH + AES-GCM hybrid, or chosen suite), key sizes, threat model, rotation rules; server never stores private keys
- [ ] **MongoDB** (or dedicated collection): `userId` → **public key** material, optional `keyVersion`, `updatedAt`; indexes for lookup by `userId`; **no device-level** rows
- [ ] **REST APIs** (OpenAPI in same PR): `PUT`/`POST` register or rotate **current** public key (authenticated); `GET` public key by `userId` with **authz** (e.g. only for users who may message that person per your policy)
- [ ] **Validation**: reject malformed keys; max payload size; rate-limit key updates
- [ ] **Audit / security**: no private key fields in any schema; structured logs must never print key material
- [ ] **Operational**: document user-initiated **rotation** (new version) and impact on decrypting old messages (product decision)

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
- [ ] Direct conversation + message documents in **MongoDB**; access-pattern-driven indexes per `PROJECT_GUIDELINES.md` §2.0; **lazy-create** direct conversation when **`POST /messages`** omits **`conversationId`** (**Cross-cutting**)
- [ ] **Socket.IO** + **RabbitMQ** (1:1): after persist, **single publish** to **recipient user-scoped** routing key → consume → emit to that user’s **Socket.IO** room (`PROJECT_PLAN.md` §3.2.1); **after auth**, join socket to `user:<userId>` (or equivalent) for direct delivery; multi-replica behaviour validated
- [ ] REST: **`POST /messages`** (see **OpenAPI** `SendMessageRequest`); conversation history + pagination (**`limit`** optional, default per **`LimitQuery`**); validation; authz (participants only)
- [ ] **OpenAPI** for messaging: covered in **`0.1.0`** — implement + **Swagger** stay aligned
- [ ] If shipping **Feature 12** in the same release as Feature 1, add **receipt-related** fields to the message schema early; otherwise **Feature 12** may introduce a migration

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: conversation list, message thread, composer (RTL + Vitest/Jest per guidelines)
- [ ] **Redux** slices/selectors for active conversation, message list cache, send optimistic/error states
- [ ] **Hooks**: `useConversation`, `useSendMessage`, Socket.IO listeners bound to store
- [ ] **Socket.IO client:** subscribe to **own user id** channel/room for direct messages; **dedupe** by `messageId` (and reconcile optimistic sends vs server echo) per `PROJECT_PLAN.md` §3.2.1
- [ ] Loading/empty/error states; accessibility for chat region
- [ ] **Sent / delivered / seen ticks** per **Feature 12** when implemented (or stub **sent** only until Feature 12 ships)

---

## Feature 2 — Sign up / log in with email and password (with verification)

### (A) Infra, backend & deployment

- [ ] User schema: unique email index, password hash (argon2/bcrypt); **`profilePicture`**, **`status`**, **`displayName`** on user record (see **OpenAPI** `User` + **Cross-cutting**)
- [ ] Registration + rate limiting; signed verification tokens; verify + resend + throttle — accept optional **`profilePicture`** (URI) and **`status`** on **`RegisterRequest`** (optional at signup only)
- [ ] Email provider or Docker **mail catcher** for dev
- [ ] JWT access + refresh; login/logout/revocation; optional password reset
- [ ] Auth middleware; verified-email rules where required
- [x] **OpenAPI** — **`RegisterRequest`** optional **`profilePicture`** + **`status`**; **`PATCH /users/me`** — **`UpdateProfileRequest`** (see **`0.1.1`**); implement routes + **Zod** still **[ ]**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: register, login, verify-email, forgot-password screens — optional **status** + **avatar URL** on register; **settings** screen for **`PATCH /users/me`** (**image upload** + **status** + **displayName**)
- [ ] **Redux** `auth` slice: tokens, user, verified flag; secure storage strategy for refresh (httpOnly cookie vs memory — align with API)
- [ ] Protected routes; redirect flows; session restore on load
- [ ] Form validation UX; error messages from API shape

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

- [ ] **Tests first**, then UI: search input (**email**), debounced requests, results list (**name**, **avatar**, **existing conversation** hint via **`conversationId`**)
- [ ] **Redux** or local state for search results + loading; empty states
- [ ] Keyboard navigation and screen reader labels for results

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

- [ ] **Heartbeat client:** in the **Socket.IO Web Worker**, **`setInterval(5000)`** → **`socket.emit('presence:heartbeat')`** while connected; clear interval on **`disconnect`**
- [ ] **Last seen read:** **`socket.emit('presence:getLastSeen', { targetUserId }, ack)`** — handle **`ok`** (show **`lastSeenAt`**, note **`source`**), **`not_available`**, **`error`**
- [ ] **Tests first**, then UI: display last seen in chat headers / contact rows (relative time); “online” vs stale per product rules + read API
- [ ] **Redux** or derived selectors for presence map keyed by user id

---

## Feature 7 — Notifications (multiple types: calls, messages, etc.)

### (A) Infra, backend & deployment

- [ ] **messaging-service**: emit **`notification`** to **`user:<userId>`** / group rooms with **`PROJECT_PLAN.md` §8** payload (`kind`: `message` for direct/group messages, `call_incoming` for audio/video); mute/DND server-side (**no** Redis Streams; **no** separate notification service — `PROJECT_PLAN.md` §3.3)
- [ ] **Web Push** (optional later): VAPID keys in env; subscription storage if product adds background push

### (B) Web-client, UI, tests & state management

- [ ] **Socket.IO client in a Web Worker**; worker forwards notification payloads to main thread (`postMessage`); main thread updates Redux / toasts
- [ ] **Tests first**, then UI: in-app toast/banner, notification centre optional; permission prompt only if Web Push is in scope
- [ ] **Redux** slice for notification queue / read state; middleware for cross-tab or analytics optional
- [ ] Map notification types to UI (message vs call); respect DND/mute preferences when API exists

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

- [ ] Dependencies: **`@aws-sdk/client-s3`**; add **`@aws-sdk/lib-storage`** (`Upload`) if streaming or multipart uploads exceed simple `PutObject` limits; **do not** add AWS SDK to **web-client**
- [ ] **S3 client factory:** configure `S3Client` from env (`docs/ENVIRONMENT.md`): region, bucket, optional key prefix; **S3-compatible endpoints** for **MinIO** (`endpoint`, `forcePathStyle: true`); credentials via **IAM role** in AWS or documented **access key** in dev only (**no secrets** in repo)
- [ ] **Upload path:** authenticated **REST** route (OpenAPI in same PR), e.g. `POST /v1/media/upload` — accept **multipart/form-data** or **raw** body with strict **Content-Length** / stream limits; **authz** before writing (user/conversation policy)
- [ ] **Before calling SDK:** validate **max size**, **MIME** sniff / allowlist (e.g. `image/jpeg`, `image/png`, `image/webp`); generate stable **object keys** (e.g. `users/{userId}/…`); avoid loading entire huge files into memory — **stream** to `PutObject` / `Upload` where practical
- [ ] **AWS SDK calls:** `PutObjectCommand` and/or **`Upload`** from `@aws-sdk/lib-storage`; handle errors (throttle, network); return **`{ key, bucket }`** and a **browser-safe URL** for display if applicable (HTTPS GET URL, or separate **GetObject** presign **only if** you add a read endpoint later — not required for MVP if URLs are public-read or behind CDN)
- [ ] **MongoDB:** message (or attachment) documents store **S3 key** (and optional public/base URL); access patterns per `PROJECT_GUIDELINES.md` §2.0
- [ ] **Operational:** structured logs **without** raw object bytes; optional **`/v1/ready`** dependency check (e.g. `HeadBucket`); **Compose / dev** MinIO bucket + env parity with AWS

### (B) Web-client (UI) — upload via API only

- [ ] **Tests first**, then UI: file picker, **upload progress** (XHR/fetch upload events to **messaging-service**), **image preview** in composer; cancel/retry
- [ ] **Flow:** **`FormData`** or binary **POST** to **messaging-service** upload endpoint → use returned **key/URL** in **send message** payload; **no** direct calls to S3 from the browser
- [ ] **Hooks / state:** `useMediaUpload` (or Redux async) wrapping API upload + errors only (**no** `aws-sdk` in client `package.json`)
- [ ] **Rendering:** show **images** in thread from URLs the API returns; **lazy load**; **alt** / a11y; optional **lightbox**
- [ ] **Env:** `VITE_API_BASE_URL` documented; if media is served from a separate **CDN/public base URL**, document it for `<img src>` construction

---

## Cross-cutting — Infrastructure and hardening

### (A) Infra, backend & deployment

- [ ] Metrics + health for **messaging-service**; structured logs; optional OpenTelemetry
- [ ] Rate limits, audit logs, secrets management, backups, load tests, runbooks

### (B) Web-client, UI, tests & state management

- [ ] Global error boundary + user-friendly API error mapping (Redux middleware or hook)
- [ ] Optional: client-side analytics hooks; performance budgets for bundle size

---

## Definition of done (MVP smoke)

- [ ] Full stack runs via documented `docker-compose` with nginx, TLS, static client, backends
- [ ] **OpenAPI** checked in; **Swagger UI** at **messaging-service** (`/api-docs`) in dev — *served; see README*
- [ ] Redux + typed hooks; features extend slices/hooks per `PROJECT_GUIDELINES.md`
- [ ] End-to-end: register → verify → login → contact → 1:1 chat → group create → group message → media → notifications → 1:1 call
- [ ] **Socket.IO** connection state visible (**connecting** / **connected** / **not connected**)
- [ ] *(If E2EE is in scope for release)* **Prerequisite — User keypair** completed; **Feature 11** wire behaviour done; 1:1 and group ciphertext on wire/at rest; **one public key per user** on server; **private keys client-only**
- [ ] *(If receipts are in scope)* **Feature 12**: **sent** / **delivered** / **seen** for 1:1 (and group policy) end-to-end

---

*Checklist version: 4.2 — Feature 6 read hardening (authz / REST mirror) deprioritized.*
