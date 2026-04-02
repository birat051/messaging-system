# Messaging Platform — Task Checklist

Use this checklist to track implementation progress. Sections align with [PROJECT_PLAN.md](./PROJECT_PLAN.md).

**Pattern:** For each feature or cross-cutting area below, work is split into **(A) Infra, backend & deployment** and **(B) Web-client, UI, tests & state management** (Redux, hooks, test-first components per `PROJECT_GUIDELINES.md`). **Prerequisite — User keypair** runs before encrypted **Feature 1** work when E2EE is required.

---

## Project setup

### (A) Infra, backend & deployment

- [x] **Repository and tooling**
  - [x] Initialize monorepo (`apps/web-client`, `apps/messaging-service`, `apps/notification-service`) with per-app folders per `PROJECT_PLAN.md` §10
  - [x] **Do not** add a **single** TypeScript, ESLint, or Prettier configuration at the **repository root** that applies to the whole monorepo
  - [x] **Each deployable is self-contained:** **`messaging-service`**, **`notification-service`**, and **`web-client`** each have their **own** **`package.json`**, **TypeScript** config, **ESLint** config, and **Prettier** config—**no** shared tooling package between the two backends (keep configs aligned by convention and copy-paste when useful, not a shared `packages/backend-tooling` dependency)
  - [x] Root **README** documents Node.js version, package manager, and how to run lint/build **per app** (**isolated** `package-lock.json` per app, no npm workspaces); optional root **`install:all` / `*:all`** scripts; **architecture and deployment** linked from **`PROJECT_PLAN.md` §13** and [`README`](../README.md)—no duplication of the full plan in the README
  - [x] **OpenAPI codegen (web-client):** **`openapi-typescript`** (highest npm adoption among the options; actively maintained) generates types from **`docs/openapi/openapi.yaml`** → **`apps/web-client/src/generated/api-types.ts`**; scripts **`generate:api`** / **`generate:api:check`**; ESLint ignores **`api-types.ts`** only; Prettier ignores **`src/generated`**. **No** `packages/shared` — OpenAPI is the contract (`PROJECT_GUIDELINES.md`).

- [ ] **messaging-service (skeleton)**
  - [ ] Bootstrap Express + TypeScript with env-based config; **local** `tsconfig.json`, **ESLint**, **Prettier**, and **`package.json`** under `apps/messaging-service` only
  - [ ] Structured logging, global error handler, request correlation IDs
  - [ ] `/health` and `/ready` endpoints
  - [ ] MongoDB connection pooling and graceful shutdown
  - [ ] **Socket.IO** on HTTP server; **RabbitMQ** client and exchange/queue bindings per `PROJECT_PLAN.md` §3.2

- [ ] **notification-service (skeleton)**
  - [ ] Express or worker + TypeScript; **its own** `tsconfig.json`, **ESLint**, **Prettier**, and **`package.json`** under `apps/notification-service` (independent from **messaging-service**)
  - [ ] Redis Stream consumer group (stub handler initially); graceful shutdown

- [ ] **Docker Compose, nginx, TLS, deployment**
  - [ ] `docker-compose`: **messaging-service**, **notification-service**, MongoDB, Redis, RabbitMQ, MinIO (or S3-compatible), **nginx**, optional **coturn**
  - [ ] nginx: reverse-proxy REST + **Socket.IO** to **messaging-service**; serve React `dist/`; TLS termination; WebSocket upgrade headers; secure context for WebRTC
  - [ ] Document hostnames, ports, env files, one-command bring-up

### (B) Web-client, UI, tests & state management

- [ ] **web-client (skeleton)**
  - [ ] Scaffold with **Vite** (`react-ts` or equivalent) under `apps/web-client`—**TypeScript**, **ESLint**, and **Prettier** live **inside `apps/web-client` only** (Vite-aligned `tsconfig.app.json`, `eslint.config`, etc.)
  - [ ] Strict TS per `PROJECT_GUIDELINES.md` §1.1
  - [ ] **Tailwind CSS** + **themes** (`tailwind.config`, tokens, optional dark mode / theme toggle)
  - [ ] **ESLint** (`typescript-eslint`, `react-hooks`, `react-refresh`, optional a11y); **Prettier** (+ optional `prettier-plugin-tailwindcss`) colocated with the Vite app
  - [ ] **react-router**, API base URL from env, **`socket.io-client`**, **`dist/`** ready for nginx

- [ ] **Redux and client architecture**
  - [ ] `@reduxjs/toolkit`, `react-redux`, typed `useAppDispatch` / `useAppSelector`, `configureStore` + middleware extension points
  - [ ] Feature slices (e.g. auth shell); `<Provider>` with router; `hooks/` for composed logic (`useAuth`, etc.); document middleware vs thunks vs components (`PROJECT_GUIDELINES.md` §4.3)

- [ ] **Connection status UI**
  - [ ] **Connecting** / **connected** / **not connected** from **Socket.IO** lifecycle; Redux or hook; **tests first** for status component

---

## API specification (OpenAPI) and Swagger UI — *complete before REST feature work*

### (A) Infra, backend & deployment

- [ ] Author **OpenAPI 3** spec under **`docs/openapi/`** (e.g. `openapi.yaml`): resources, schemas, Bearer JWT, errors, pagination; tags; `/v1`
- [ ] **messaging-service:** validate requests with **Zod** (or equivalent) matching the spec; same PR when routes change
- [ ] Serve **Swagger UI** from **messaging-service** (e.g. `swagger-ui-express`) at **`/api-docs`**; works in Docker Compose / local dev; document URL
- [ ] Optional: restrict Swagger to non-prod or auth
- [ ] Process: update OpenAPI in same PR as route changes (`PROJECT_GUIDELINES.md` §3)

### (B) Web-client, UI, tests & state management

- [ ] Document in README how frontend devs open Swagger (URL, port)
- [x] **web-client:** **openapi-typescript** wired (`generate:api`); placeholder spec at **`docs/openapi/openapi.yaml`**

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
- [ ] Direct conversation + message documents in **MongoDB**; access-pattern-driven indexes per `PROJECT_GUIDELINES.md` §2.0
- [ ] **Socket.IO** + **RabbitMQ**: persist → publish → consume → emit to rooms; multi-replica behaviour validated
- [ ] REST: conversation history + pagination; validation; authz (participants only)
- [ ] Update **OpenAPI** + **Swagger** for new routes
- [ ] If shipping **Feature 12** in the same release as Feature 1, add **receipt-related** fields to the message schema early; otherwise **Feature 12** may introduce a migration

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: conversation list, message thread, composer (RTL + Vitest/Jest per guidelines)
- [ ] **Redux** slices/selectors for active conversation, message list cache, send optimistic/error states
- [ ] **Hooks**: `useConversation`, `useSendMessage`, Socket.IO listeners bound to store
- [ ] Loading/empty/error states; accessibility for chat region
- [ ] **Sent / delivered / seen ticks** per **Feature 12** when implemented (or stub **sent** only until Feature 12 ships)

---

## Feature 2 — Sign up / log in with email and password (with verification)

### (A) Infra, backend & deployment

- [ ] User schema: unique email index, password hash (argon2/bcrypt)
- [ ] Registration + rate limiting; signed verification tokens; verify + resend + throttle
- [ ] Email provider or Docker **mail catcher** for dev
- [ ] JWT access + refresh; login/logout/revocation; optional password reset
- [ ] Auth middleware; verified-email rules where required
- [ ] Update **OpenAPI** for auth routes

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: register, login, verify-email, forgot-password screens
- [ ] **Redux** `auth` slice: tokens, user, verified flag; secure storage strategy for refresh (httpOnly cookie vs memory — align with API)
- [ ] Protected routes; redirect flows; session restore on load
- [ ] Form validation UX; error messages from API shape

---

## Feature 3 — Video / audio call between two users (1:1)

### (A) Infra, backend & deployment

- [ ] **Socket.IO** signaling: offer/answer/ICE; authz for peer pairs
- [ ] **STUN**; **TURN** (coturn in Compose or managed); nginx/WSS/TURN ports documented
- [ ] Optional: link call events to Redis Streams for notifications (Feature 7)

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
- [ ] Optional: notification stream types for group call events

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: group call join/leave, participant grid/list, dominant speaker optional
- [ ] **State**: participant map, connection quality stubs if needed; Redux or hooks per complexity
- [ ] Reuse or extend 1:1 WebRTC patterns; clear error when SFU unavailable

---

## Feature 5 — Search users by email

### (A) Infra, backend & deployment

- [ ] MongoDB index on email (exact/prefix per privacy); search API + rate limits
- [ ] Privacy rules (discoverability); minimal fields in responses
- [ ] Update **OpenAPI**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: search input, debounced requests, results list
- [ ] **Redux** or local state for search results + loading; empty states
- [ ] Keyboard navigation and screen reader labels for results

---

## Feature 6 — Last seen per user

### (A) Infra, backend & deployment

- [ ] **Redis** last-seen updates (activity + optional heartbeat TTL); read path; optional MongoDB mirror
- [ ] API for authorized viewers; future “invisible” flag if scoped

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: display last seen in chat headers / contact rows (relative time)
- [ ] Client heartbeat or activity pings per API contract
- [ ] **Redux** or derived selectors for presence map keyed by user id

---

## Feature 7 — Notifications (multiple types: calls, messages, etc.)

### (A) Infra, backend & deployment

- [ ] Redis Stream schema; **messaging-service** `XADD` on message/call events
- [ ] **notification-service**: consumer groups, idempotency, retries; branch by `message_received`, `call_incoming`, `call_missed`, etc.
- [ ] **Web Push**: VAPID keys in env; subscription storage if needed
- [ ] In-app fan-out via **Socket.IO** from messaging path where designed

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: permission prompt, in-app toast/banner, notification centre optional
- [ ] **Redux** slice for notification queue / read state; middleware for cross-tab or analytics optional
- [ ] Map notification types to UI (message vs call); respect DND/mute preferences in UI when API exists

---

## Feature 8 — Group messaging

### (A) Infra, backend & deployment

- [ ] Group + group-conversation models; membership ACL
- [ ] Persist + **RabbitMQ** + **Socket.IO** fan-out; pagination; **delivery/read receipt** behaviour per **Feature 12** for groups
- [ ] Update **OpenAPI**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: group thread, member list sidebar, composer
- [ ] **Redux**: groups list, active group, messages by group id
- [ ] Hooks for group send/receive; distinguish direct vs group in router/store
- [ ] **Receipt ticks** for group messages per **Feature 12** (aggregate or per-member policy)

---

## Feature 9 — Create groups

### (A) Infra, backend & deployment

- [ ] Create/update/archive group APIs; authz for admins/creators
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

### (A) Infra, backend & deployment

- [ ] Presigned PUT/GET from **messaging-service**; keys on messages; bucket CORS; **MinIO** in Compose for dev
- [ ] Max size + MIME allowlist before presign

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: file picker, upload progress, image preview in composer
- [ ] Upload via presigned URL from client; error handling; Redux/async thunk or hook for upload state

---

## Cross-cutting — Infrastructure and hardening

### (A) Infra, backend & deployment

- [ ] Metrics + health for both services; structured logs; optional OpenTelemetry
- [ ] Rate limits, audit logs, secrets management, backups, load tests, runbooks

### (B) Web-client, UI, tests & state management

- [ ] Global error boundary + user-friendly API error mapping (Redux middleware or hook)
- [ ] Optional: client-side analytics hooks; performance budgets for bundle size

---

## Definition of done (MVP smoke)

- [ ] Full stack runs via documented `docker-compose` with nginx, TLS, static client, backends
- [ ] **OpenAPI** checked in; **Swagger UI** at **messaging-service** (e.g. `/api-docs`) in dev
- [ ] Redux + typed hooks; features extend slices/hooks per `PROJECT_GUIDELINES.md`
- [ ] End-to-end: register → verify → login → contact → 1:1 chat → group create → group message → media → notifications → 1:1 call
- [ ] **Socket.IO** connection state visible (**connecting** / **connected** / **not connected**)
- [ ] *(If E2EE is in scope for release)* **Prerequisite — User keypair** completed; **Feature 11** wire behaviour done; 1:1 and group ciphertext on wire/at rest; **one public key per user** on server; **private keys client-only**
- [ ] *(If receipts are in scope)* **Feature 12**: **sent** / **delivered** / **seen** for 1:1 (and group policy) end-to-end

---

*Checklist version: 2.8 — openapi-typescript wired in web-client; see PROJECT_PLAN.md §10.*
