# Ekko — Task Checklist

Use this checklist to track implementation progress. Sections align with [PROJECT_PLAN.md](./PROJECT_PLAN.md). **Document order** puts **E2EE alignment** sections (**Prerequisite — User keypair**, **Feature 11**, **Feature 13**) right after **How to read**, then **MVP scope — outstanding**, then remaining **Post-MVP / extended scope**, then **Shipped**—see **[Document order](#document-order)** and **[How to read this checklist](#how-to-read-this-checklist)** (not strict build order).

**Pattern:** For each feature or cross-cutting area below, work is split into **(A) Infra, backend & deployment** and **(B) Web-client, UI, tests & state management** (Redux, hooks, test-first components per **`docs/PROJECT_PLAN.md` §14**). **Prerequisite — User keypair** runs before encrypted **Feature 1** work when E2EE is required. **Default E2EE UX:** no **Settings → encryption** for end users; **chat-thread** E2EE indicator instead—see **Prerequisite — Product direction** and **Feature 1 (B)**.

**Granularity:** Where a single bullet used to imply many files or layers (e.g. **MSW** + **handlers** + **test utils**, or **MongoDB** + **RabbitMQ** + **Socket.IO**), it is broken into **nested subtasks** so one PR or one agent prompt can close a **small vertical slice** without rewriting half the app.

---

## Document order

Immediately after **How to read this checklist**, **Prerequisite — User keypair**, **Feature 11 — Message encryption**, and **Feature 13 — Multi-device key sync** appear first so pending E2EE alignment work (per [PROJECT_PLAN.md](./PROJECT_PLAN.md) §7.1) is visible at the top. Then: **(1) MVP scope — outstanding** (Definition of done through Infrastructure and hardening), **(2) remaining Post-MVP / extended scope** (group, contacts, etc.), **(3) Shipped**. Section order is for **prioritization and scanning**, not strict build order—see **How to read this checklist**.

---

## How to read this checklist

**E2EE alignment (§7.1):** **Prerequisite — User keypair**, **Feature 11**, and **Feature 13** are placed immediately below this section so open tasks for the per-device hybrid model are easy to find. Within other groups in **[Document order](#document-order)**, headings that still contain at least one `- [ ]` appear before headings that are fully checked where applicable. Then **MVP scope — outstanding** (**Definition of done** through **Infrastructure and hardening**), then remaining **Post-MVP / extended scope**, then **Shipped**. **Implementation / dependency order** (e.g. Prerequisite → Feature 1) is still defined in [PROJECT_PLAN.md](./PROJECT_PLAN.md)—this file’s **section order** is for **prioritization and scanning**, not a prescribed build sequence.

---

## Prerequisite — User keypair: generate, store, and maintain (before encrypted messaging / Feature 1)

**Order:** Complete this section **before** implementing **ciphertext** in **Feature 1** (if MVP requires E2EE from the first message). If you ship **plaintext** messaging first, still complete this early so Feature 1 can switch to encrypted payloads without rework. Aligns with **Feature 11** (full wire protocol and group wrapping); this prerequisite focuses on **lifecycle** only.

**Key model (updated — per-device):** **Private keys are device-only** — each device generates its own P-256 key pair, stores the private key in IndexedDB, and registers its public key with the server under `(userId, deviceId)`. There is **no single user-level public key**; the server holds a device key registry per user. See **Feature 11** and **`docs/PROJECT_PLAN.md` §7.1**.

### Prerequisite — Product direction (E2EE UX)

The **default product** does **not** expose a **Settings** (or similar) screen for **encryption / key backup / rotate / key status**—end users should **not** have to “manage keys” in the UI. Satisfy **`docs/PROJECT_PLAN.md` §7.1** (per-device hybrid encryption, device public key registry, client-only private keys) and the **opaque message payloads** principle (server routes `{ ciphertext, encryptedMessageKeys }` without decrypting) **without** a key-management surface: **automatic** device key generation + registration on first login; device sync via **Feature 13**; recovery/rotation only via documented paths. **Chat** UX carries a **small, persistent** indicator that messages are end-to-end encrypted (see **Feature 1 (B)** and **Feature 11 (B)**).

### (A) Infra, backend & deployment

- [x] **Design doc:** update **`docs/PROJECT_PLAN.md` §7.1** — per-device hybrid model (AES-256-GCM for payload + ECDH key wrapping per device), `deviceId` lifecycle (register on first login, revoke on logout/device removal), threat model; server never stores private keys or unencrypted message keys
- [x] **MongoDB (device key registry):** replace user-level schema; new collection — compound key `(userId, deviceId)` → `publicKey` (SPKI base64), `createdAt`, `updatedAt`; unique compound index `(userId, deviceId)`; index on `userId` for listing all devices; update **`UserPublicKeyDocument`** + **`ensureUserPublicKeyIndexes`** in **`src/data/userPublicKeys/`**
- [x] **OpenAPI (device key APIs):** `POST /v1/users/me/devices` (register device public key, server assigns or confirms `deviceId`); `GET /v1/users/:userId/devices/public-keys` (list all active device public keys, authz: participants only); `DELETE /v1/users/me/devices/:deviceId` (revoke device key); update `Message` schema with `encryptedMessageKeys` map + `iv`; bump spec; `npm run generate:api`
- [ ] **Routes + Zod:** implement device key handlers (replacing old user-level routes); Zod schemas for register body + response; **authz** on `GET /users/:userId/devices/public-keys` (conversation participants only)
- [x] **Validation:** reject malformed keys; max payload size; rate-limit key updates
- [x] **Audit / security:** no private key fields in any schema; structured logs must never print key material
- [ ] **Operational:** document device revocation (call `DELETE` on logout); recovery for lost-device via **Feature 13 — Multi-device key sync**; update **`README.md`** and **`docs/PROJECT_PLAN.md` §7.1**

### (B) Web-client, UI, tests & state management

- [x] **Generate (device-scoped):** on first authenticated session on this device, generate P-256 key pair via Web Crypto API (`generateP256EcdhKeyPair`); assign stable `deviceId` (UUID, persisted in IndexedDB alongside private key); register via `POST /v1/users/me/devices`; store `deviceId` in `cryptoSlice`; gate on `useAuth().isAuthenticated`; unit tests with test vectors unchanged in **`keypair.ts`** / **`keypair.test.ts`**
- [x] **Store private key securely:** never send to server; persist wrapped private key in IndexedDB (keyed by `deviceId`), encrypted with PBKDF2-derived key + AES-256-GCM; **`privateKeyStorage.ts`**, **`privateKeyWrap.ts`**, **`secureContext.ts`** — mechanism unchanged, scoped by `deviceId`
- [x] **Register device public key:** call `POST /v1/users/me/devices` on session bootstrap if no `deviceId` in IndexedDB or server returns 404 for known `deviceId`; persist returned `deviceId`; update `cryptoSlice` — replace `putMyPublicKey` / `rotateMyPublicKey` with `registerDevice` thunk + `useRegisterDevice` hook
- [ ] **Maintain (device lifecycle):** on logout optionally call `DELETE /v1/users/me/devices/:deviceId`; retain private key in IndexedDB for recovery; update `useKeypairMaintenance`; see **Feature 13** for multi-device sync
- [ ] **Hooks:** update `useKeypairStatus` (check `deviceId` present + registered on server), rename `useRegisterPublicKey` → `useRegisterDevice`, update `useRestorePrivateKey` (restore from IndexedDB by `deviceId`); remove stale `putMyPublicKey` / `rotateMyPublicKey` from `usersApi`
- [x] **Remove encryption / key-management UI from Settings** (profile/account only per **§10.1**; E2EE is automatic and programmatic):
  - [x] All `EncryptionSettingsSection`, `EncryptionBackupPrompt`, `EncryptionSetupWizard` components and tests removed
  - [x] `showEncryptionSettingsUi.ts` removed; Settings page is profile-only
  - [x] Programmatic crypto hooks (`cryptoSlice`, `ensureUserKeypairReadyForMessaging`, `useSendEncryptedMessage`) remain in `common/` with no `modules/settings` imports — `keyLifecycleImportPolicy.test.ts` asserts clean
- [x] **Integration checkpoint (per-device):** first encrypted message can be sent with automatic device key setup; sender fetches all recipient device public keys, wraps message key per device, sends `{ body: ciphertext, iv, encryptedMessageKeys }`; recipient decrypts using `encryptedMessageKeys[myDeviceId]` + private key; no “encryption setup” wizard in UI

---

## Feature 11 — Message encryption (asymmetric / hybrid; 1:1 and group)

**Post-MVP for the full spec:** **Bounded MVP** does **not** require completing the **(A)** bullets below (threat model, group strategies, key rotation APIs, etc.) or **(B)** group flow / **`usePublicKey`** formalization — **1:1** encrypted messaging is the **baseline** shipped under **Feature 1** / **Feature 11 (B) — 1:1 flow** (`[x]` below). **Group** encryption and the rest of this section are **post-MVP**.

**Prerequisite:** **User keypair** (generate, store, maintain) should be complete before relying on encrypted **Feature 1** / **Feature 8** traffic; this section extends that with **message envelopes**, **group** strategies, and transport alignment.

**Cryptography note (hybrid model):** Each device generates a unique **P-256 ECDH key pair**. Encryption uses **AES-256-GCM** for the message payload (keyed by a random per-message symmetric key) and **ECIES / ECDH + AES-KW** to wrap that message key for each recipient device. The server stores one ciphertext plus a `encryptedMessageKeys: { deviceId → wrappedKey }` map — it never sees the symmetric message key or plaintext. See **`docs/PROJECT_PLAN.md` §7.1** for the full protocol and flow diagrams.

**Key model (per-device hybrid):** **Private keys are device-only** — generated in-browser, stored in IndexedDB, never sent to the server. **Each device registers its own public key** (`userId + deviceId → publicKey`); the server stores a device key registry per user. Senders fetch **all active device public keys** for a recipient (plus their own other devices) and wrap the message key for each device individually. See **`docs/PROJECT_PLAN.md` §7.1**.

### (A) Infra, backend & deployment

- [x] **Threat model and design doc**: server stores **ciphertext** and **per-device public keys** only; symmetric message key is wrapped per-device and stored alongside ciphertext; **private keys never leave devices**; document algorithms (P-256 ECDH + AES-256-GCM), device key lifecycle, and threat model in `docs/PROJECT_PLAN.md` §7.1
- [x] **Device public key registry**: schema `(userId, deviceId)` → `publicKey` (SPKI base64), `createdAt`, `updatedAt`; compound unique index on `(userId, deviceId)`; index on `userId` alone for listing all devices of a user; replace any prior user-level-only key collection
- [x] **APIs (device keys)**: `POST /users/me/devices` — register new device public key (issues `deviceId`); `GET /users/:userId/devices/public-keys` — list all active device public keys for a user (authz: only conversation participants); `DELETE /users/me/devices/:deviceId` — revoke a device; update **OpenAPI** + **Zod** in the same PR
- [x] **Message persistence (new schema)**: `body` = AES-256-GCM ciphertext (base64); `encryptedMessageKeys: { [deviceId]: string }` — one entry per device that should be able to read the message; `iv` (or embed in body); algorithm tag; server stores both fields opaquely, never decrypts
- [ ] **Group messaging**: per-message hybrid model — generate message key, encrypt body once with AES-256-GCM, wrap key for **every device of every member** (including sender devices); `encryptedMessageKeys` fan-out grows with total device count, not member count; document join/leave key re-wrapping strategy
- [x] **Socket.IO / RabbitMQ**: deliver `{ body, encryptedMessageKeys, iv }` envelope opaquely; no plaintext logging; document updated message envelope in **OpenAPI** + `docs`
- [x] **OpenAPI**: update `Message` schema — add `encryptedMessageKeys` (`additionalProperties: string`), `iv`; document `body` as AES-256-GCM ciphertext; bump spec version; `npm run generate:api`
- [ ] **Operational**: device key revocation flow; recovery for lost device (access via another trusted device — see **Feature 13 — Multi-device key sync**); **no** user-facing Settings encryption management UI

### (B) Web-client, UI, tests & state management

- [x] **Crypto module** (`web-client`): extend **`src/common/crypto/`** — add `generateMessageKey()` (AES-256-GCM, 256-bit random), `encryptMessageBody(messageKey, plaintext)` → `{ ciphertext, iv }`, `decryptMessageBody(messageKey, ciphertext, iv)` → `plaintext`, `wrapMessageKey(messageKey, devicePublicKey)` → `encryptedKey`, `unwrapMessageKey(encryptedKey, devicePrivateKey)` → `messageKey`; **unit tests** with deterministic test vectors; no real private keys in repo
- [x] **Key lifecycle (non-Settings):** automatic device key generation + registration on first login; silent re-registration if key missing; message-thread inline states only for errors (e.g. “this device cannot decrypt this message” if `encryptedMessageKeys` has no entry for `myDeviceId`)
- [x] **1:1 flow (per-device hybrid)**: before send — (1) fetch all device public keys for recipient **and** sender’s own other devices via `GET /users/:userId/devices/public-keys`; (2) `generateMessageKey()`; (3) `encryptMessageBody(messageKey, plaintext)` → `{ ciphertext, iv }`; (4) for each device key: `wrapMessageKey(messageKey, devicePublicKey)` → build `encryptedMessageKeys` map; (5) send `{ body: ciphertext, iv, encryptedMessageKeys }`; on receive — (6) look up `encryptedMessageKeys[myDeviceId]`, (7) `unwrapMessageKey(entry, myPrivateKey)` → `messageKey`, (8) `decryptMessageBody(messageKey, body, iv)` → plaintext; handle missing device entry with inline UX
- [ ] **Group flow**: same per-device wrapping; fetch all device public keys for all group members; build `encryptedMessageKeys` with one entry per device; on receive, same 6-8 steps; handle member join/leave by updating key entries for future messages
- [x] **Redux / hooks**: `useDevicePublicKeys(userId)` — cached device key list per user with invalidation; `useEncryptMessage` — wraps generate + encrypt + wrap-per-device; `useDecryptMessage` — wraps lookup + unwrap + decrypt; cache device key lists in Redux to avoid re-fetching per message
- [x] **Tests first** (`*.tsx`): **E2EE indicator** in chat thread (unchanged UX); “cannot decrypt” inline state when `encryptedMessageKeys[myDeviceId]` absent; encrypt/decrypt round-trip unit tests in `src/common/crypto/`

#### Legacy E2EE removal — hybrid-only (`apps/web-client/` + `apps/messaging-service/`)

**Goal:** **No backward compatibility** for pre-hybrid wire formats or user-level-only keys. Remove **all** legacy E2EE code paths so only the per-device hybrid model remains (**`docs/PROJECT_PLAN.md` §7.1** — `body` + `iv` + `encryptedMessageKeys` + `algorithm`, device registry). Assume **greenfield or wiped message/key data** where old rows would otherwise be unreadable.

- [x] **Inventory — list every legacy E2EE surface to delete**
  - [x] **`apps/web-client/`:** ECIES / **`E2EE_JSON_V1:`** pipeline (**`messageEcies.ts`**, **`isE2eeEnvelopeBody`**, decrypt/send branches in **`useSendEncryptedMessage`**, **`usePeerMessageDecryption`**, **`useDecryptMessage`**, **`messagingSlice.mergeOwnE2eeBodyFromOptimistic`**, **`resolveMessageDisplayBody`**); user-directory **`GET /users/.../public-key`** helpers (**`fetchRecipientPublicKey`**, etc.); tests and **`e2ee*Trace.ts`** copy that reference legacy envelopes. **Done:** hybrid-only send/decrypt/display (**`mergeOwnHybridWireBodyFromOptimistic`**, **`fetchDevicePublicKeys`** / **`usePrefetchDevicePublicKeys`**); legacy modules removed; **`e2ee*Trace.ts`** updated; **`npm test`** green.
  - [x] **`apps/messaging-service/`:** User-level public-key **routes/repos** (e.g. **`userPublicKeys`**, **`GET /v1/users/:id/public-key`**), validators, OpenAPI fields, and any send/receive logic that exists **only** to support legacy body shapes; grep controllers and **`sendMessage`** for legacy-only branches. **Done:** removed **`PUT /users/me/public-key`**, **`POST /users/me/public-key/rotate`**, **`GET /users/{userId}/public-key`**; repo helpers **`findPublicKeyByUserId`**, **`upsertPublicKeyPut`**, **`rotatePublicKey`**, **`toUserPublicKeyResponse`**; Zod **`put`/`rotate`** schemas; OpenAPI + **`README`** env table; **`sendMessage`** had no legacy-only branches. **`DevicePublicKeyEntry`** now includes **`keyVersion`** for directory listing. **`npm test`** green.
- [x] **Delete — `apps/web-client/`:** Strip legacy E2EE modules and imports; **require** device keys for send (fail fast if missing); simplify Redux/UI to hybrid-only; update or delete tests that asserted ECIES or mixed wire shapes; refresh **`e2eeInboundDecryptTrace.ts`** / **`e2eeOutboundSendTrace.ts`** / **`e2eeReceiveTrace.ts`**; run **`npm run lint`**, **`npm run typecheck`**, **`npm test`** in **`apps/web-client`**. **Note:** **`npm test`** passes; **`npm run typecheck`** / **`npm run lint`** may still report unrelated issues elsewhere in the package until cleaned up.
- [x] **Delete — `apps/messaging-service/`:** Remove legacy user-public-key APIs and related MongoDB usage if unused by hybrid; tighten **`SendMessageRequest` / `Message`** validation to hybrid-only where appropriate; update **`docs/openapi/openapi.yaml`**, **`README.md`**, **`docs/PROJECT_PLAN.md`** references; regenerate web-client types (**`npm run generate:api`**); run **`npm run lint`**, **`npm run typecheck`**, **`npm test`** (and **`MESSAGING_INTEGRATION=1`** where applicable) in **`apps/messaging-service`**. **Done:** OpenAPI + **`README`** updated; **`npm run generate:api`** / **`generate:api:check`**; **`npm test`** green. **`npm run typecheck`** may still fail on pre-existing test typing issues in the package.
- [ ] **Verification:** Hybrid-only **1:1** smoke (send/receive/reload); no **`E2EE_JSON_V1`** or legacy public-key-only path in source; OpenAPI matches implementation.

---

## Feature 13 — Multi-device key sync

**Goal:** When a user adds a new device (or reinstalls the app on an existing device), that device can gain access to **past message history** without re-encrypting any stored ciphertext. An existing trusted device re-encrypts the stored per-message keys for the new device and uploads only those key entries. The original ciphertext is **never modified**.

**Protocol reference:** **`docs/PROJECT_PLAN.md` §7.1 — New Device Sync Flow (Key Re-sharing)**.

**Prerequisite:** **Prerequisite — User keypair** and **Feature 11** per-device hybrid model must be in place first.

---

### (A) Infra, backend & deployment

- [x] **Device registration API (bootstrap):** `POST /v1/users/me/devices` — new device submits its public key (`pubKey`, SPKI base64) and optionally a `deviceLabel` (e.g. "Chrome on MacBook"); server assigns `deviceId` (UUID), stores `(userId, deviceId, pubKey, createdAt)`; returns `{ deviceId }`; **authz:** requires valid session JWT; **Zod** + **OpenAPI** in same PR
- [x] **Device list API:** `GET /v1/users/me/devices` — authenticated user lists their own registered devices (`deviceId`, `deviceLabel`, `createdAt`, `lastSeenAt`); used by existing trusted device to confirm new device is pending sync; **OpenAPI** + **Zod**
- [x] **Sync trigger (server-side state):** when a new device is registered (`POST /v1/users/me/devices`), emit a Socket.IO event `device:sync_requested` to `user:<userId>` room so existing connected devices receive it immediately; payload `{ newDeviceId, newDevicePublicKey }`; no RabbitMQ fan-out required (same-user notification, ephemeral)
- [x] **Message keys fetch API (for syncing device):** `GET /v1/users/me/sync/message-keys?afterMessageId=&limit=` — returns a paginated list of `{ messageId, encryptedMessageKey }` entries for the **caller's own `deviceId`** (existing trusted device); used by trusted device to fetch its encrypted copies of message keys in batches for re-encryption; **authz:** caller must be an active device of the user; cursor-based pagination; **Zod** + **OpenAPI**
- [x] **Batch key upload API (for new device):** `POST /v1/users/me/sync/message-keys` — body `{ targetDeviceId, keys: [{ messageId, encryptedMessageKey }] }`; inserts or upserts `encryptedMessageKeys[targetDeviceId]` on each message document (MongoDB `$set` on nested field path); **authz:** caller (`sourceDeviceId` from JWT) must be an existing registered device of the same user; **idempotent** (re-uploading same `messageId + targetDeviceId` key is safe); rate-limit per user per window; **Zod** + **OpenAPI**
- [x] **Device revocation API:** `DELETE /v1/users/me/devices/:deviceId` — removes device from registry; **does not** delete `encryptedMessageKeys[deviceId]` entries on messages (data hygiene vs storage tradeoff — document decision); **authz:** only the owning user; **OpenAPI** + **Zod**. **Done:** OpenAPI + **`deviceIdPathSchema`** (aligned with **`registeredDeviceIdStringSchema`**); **`docs/PROJECT_PLAN.md`** + repo/controller notes; web **`deleteMyDevice`** + **`API_PATHS.users.meDeviceById`**
- [x] **OpenAPI:** document all Feature 13 endpoints; add `SyncMessageKeyEntry`, `BatchKeyUploadRequest`, `DeviceListResponse` schemas; bump spec version; `npm run generate:api`
- [x] **MongoDB:** confirm `messages.encryptedMessageKeys` field supports sparse per-device entries (`{ [deviceId]: base64 }`); index on `conversationId + createdAt` already exists (used by sync pagination); no new collection needed
- [x] **Rate limits:** per-user rate limit on `POST /v1/users/me/sync/message-keys` (batch upload) — e.g. `DEVICE_SYNC_RATE_LIMIT_*` env vars; document in **`README.md`** (Configuration section)

---

### (B) Web-client, UI, tests & state management

#### New device — onboarding state

- [x] **Device bootstrap detection:** on session restore / login, after `POST /v1/users/me/devices` returns a `deviceId` that has **no** conversation history decryptable (all `encryptedMessageKeys` lack an entry for `myDeviceId`), enter **"new device, awaiting sync"** state in `cryptoSlice` (`syncState: 'pending' | 'in_progress' | 'complete' | 'idle'`)
- [x] **New device pending UI (`NewDeviceSyncBanner`):** full-width banner ( blocking modal for first login) — **"This is a new device. Open the app on another device you trust to sync your message history."**; shows list of other registered devices (from `GET /v1/users/me/devices`) so the user knows which device to approve from; **tests first** (`*.tsx`) — renders pending state, lists other devices, shows spinner when sync in progress
- [x] **New device can send / receive new messages immediately** — only past message history is locked; banner persists until sync completes; new incoming messages with `encryptedMessageKeys[myDeviceId]` decrypt normally

#### Existing trusted device — approving sync

- [x] **`device:sync_requested` Socket.IO handler:** in `socketWorker.ts`, listen for `device:sync_requested`; `postMessage` to main thread as `{ type: 'device_sync_requested', payload: { newDeviceId, newDevicePublicKey } }`; `SocketWorkerProvider` dispatches to Redux `cryptoSlice`
- [x] **Incoming sync request UI (`DeviceSyncApprovalBanner`):** toast or persistent banner on existing device — **"A new device is requesting access to your message history. Approve to sync encrypted keys."** — with **Approve** and **Dismiss** buttons; **tests first** (`*.tsx`) — renders banner, Approve triggers sync, Dismiss hides it; **no private key is ever sent to the server or the new device** — only re-encrypted message keys
- [x] **Sync orchestrator hook (`useDeviceKeySync`):** triggered on **Approve**; steps:
  - [x] Fetch `newDevicePublicKey` from payload (already in event; verify matches `GET /v1/users/me/devices` listing)
  - [x] Paginate `GET /v1/users/me/sync/message-keys` (batches of 100 or configurable); for each batch:
    - [x] For each `{ messageId, encryptedMessageKey }`: `unwrapMessageKey(encryptedMessageKey, myPrivateKey)` → `messageKey`; `wrapMessageKey(messageKey, newDevicePubKey)` → `newEncryptedKey`
    - [x] Accumulate `{ messageId, encryptedMessageKey: newEncryptedKey }` entries
    - [x] `POST /v1/users/me/sync/message-keys` with `{ targetDeviceId: newDeviceId, keys: [...] }`
  - [x] On completion dispatch `syncCompleted(newDeviceId)` to `cryptoSlice`; show success toast on existing device
  - [x] **Tests (unit):** `useDeviceKeySync` — mock `GET` pagination + crypto operations + `POST` batches; assert correct key-wrapping calls; assert no private key leaves the client

#### New device — post-sync access

- [x] **Post-sync message decryption:** after sync completes (polled via `GET /v1/users/me/devices` status or Socket.IO `device:sync_complete` event from server after batch upload), new device re-fetches conversation message list; each message now has `encryptedMessageKeys[myDeviceId]`; decrypt via standard `unwrapMessageKey` + `decryptMessageBody`; `syncState` transitions to `'complete'`; banner dismissed
- [x] **`device:sync_complete` Socket.IO event (server → new device):** server emits after `POST /v1/users/me/sync/message-keys` batch upload completes (or after a threshold of messages covered); new device `socketWorker` forwards to main thread → `evaluateDeviceSyncBootstrapState` + `setSyncState('complete')` + SWR revalidate; allows immediate re-fetch without polling

#### Redux state

- [x] **`cryptoSlice` additions:** `deviceId: string | null`, `registeredOnServer: boolean`, `syncState: 'idle' | 'pending' | 'in_progress' | 'complete'`, `pendingSyncFromDeviceId: string | null`, `pendingSyncFromDevicePublicKey: string | null`; actions: `deviceRegistered`, `syncRequested`, `syncStarted`, `syncCompleted`, `syncDismissed`; selectors: `selectSyncState`, `selectPendingSync`
- [x] **Persisted `deviceId`:** store `deviceId` in IndexedDB (alongside private key in `privateKeyStorage.ts`) so it survives page reload; load on session restore before `registerDevice` check

#### Tests

- [x] **`NewDeviceSyncBanner.test.tsx`:** renders pending state; shows other device list; Approve triggers `useDeviceKeySync`; Dismiss updates Redux `syncDismissed`
- [x] **`DeviceSyncApprovalBanner.test.tsx`:** renders when `pendingSync` is set; Approve calls sync hook; Dismiss clears state; banner absent in `syncState: 'idle'`
- [x] **`useDeviceKeySync.test.ts`:** mock API pagination (`GET` returns two pages); mock crypto (`unwrapMessageKey`, `wrapMessageKey`); assert `POST` batch calls with correct `targetDeviceId` + re-wrapped keys; assert `syncCompleted` dispatched; assert no network call leaks private key bytes
- [x] **Integration:** end-to-end smoke — device A sends message, device B (new) registers, device A approves sync, device B decrypts historical message — manual checklist or `MESSAGING_INTEGRATION=1` extension

---

## Definition of done (MVP smoke)

- [x] **`docker compose`** brings up **messaging-service** + deps per **`README.md`**
- [x] **nginx** serves **web-client** **`dist/`** + proxies API (or documented equivalent)
- [ ] **TLS** documented for production (even if local dev stays HTTP)
- [ ] **OpenAPI** in repo; **`npm run generate:api`** in **web-client**; **Swagger** at **`/api-docs`**
- [ ] **Redux** + typed hooks per \***\*`docs/PROJECT_PLAN.md` §14\*\***
- [ ] **Smoke — auth:** register → login ( **`EMAIL_VERIFICATION_REQUIRED=false`** default; separate smoke if **`true`** )
- [ ] **Smoke — messaging:** 1:1 thread send/receive (**group** messaging is **post-MVP** — see scope note under **Definition of done**)
- [ ] **Smoke — media:** upload + attach in thread
- [ ] **Smoke — notifications:** in-tab **`notification`** for a message after broker fan-out (topic **`message.user.<recipient>`** → consumer → **`user:<recipient>`** Socket.IO room) — or stub if not wired end-to-end
- [ ] **Smoke — call:** 1:1 call happy path (or documented skip)
- [ ] **Feature 2a (optional):** guest path — **button → small dedicated guest page** (**username**); **guest ↔ guest** messaging only; **not** merged with **register** (see **Feature 2a** caveats)
- [ ] **Socket.IO** status visible (**connecting** / **connected** / **disconnected**)
- [ ] _(If E2EE in scope)_ **Prerequisite — User keypair** (per-device key pair + device registration) + **Feature 11** per-device hybrid send/receive (AES-256-GCM + `encryptedMessageKeys` map) + **Feature 1 (B)** E2EE indicator in chat; **Feature 13** multi-device sync covers new-device key re-sharing — not required for single-device MVP but must not be broken by Feature 11 work
- [ ] _(If receipts in scope)_ **Feature 12** **sent** / **delivered** / **seen** end-to-end

> **Out of MVP scope (deprioritized):** per-user **DND** / notification **mute** / quiet hours — not scheduled for the bounded MVP; see **Feature 7 — Post-MVP (DND)** below.

> **Post-MVP / not in bounded MVP:** **Feature 4** (group call), **Feature 8** (group messaging), **Feature 9** (create groups), **Feature 10** (contact list), and the **full Feature 11** spec (threat model, group keys, APIs beyond **1:1** shipped today) — they stay in this checklist for **future** work and **do not** gate MVP delivery.

## MVP — Privacy policy & terms of service

**Scope:** **Bounded MVP** — ship readable **Privacy Policy** and **Terms and Conditions** in the web client, discoverable from auth surfaces and Settings (no separate legal review workflow implied here; product owner supplies or approves copy).

### (B) Web-client — documents, routing, and placement

- [x] **Privacy Policy:** add a real document (Markdown or TSX page) with final or placeholder MVP copy; expose via a dedicated route (e.g. **`/privacy`**) and ensure it is included in production build / static assets as needed.
- [x] **Terms and Conditions:** same as above (e.g. **`/terms`**).
- [x] **Auth surfaces — footer links:** at the **bottom** of **Login**, **Register**, and **Guest entry** pages, add **text links** (open in same tab or new tab per UX choice) to **Privacy Policy** and **Terms and Conditions**; keep layout accessible (**`footer`**, sufficient contrast, keyboard focus order).
- [x] **Settings:** add **sections** (or equivalent grouped blocks) that link to **Privacy Policy** and **Terms and Conditions** (same routes as auth footers); align with existing Settings layout and **RTL** / smoke tests if present.
- [x] **Router:** register routes in the app router; unauthenticated users must be able to open **`/privacy`** and **`/terms`** without logging in (or document if intentionally gated — default: **public**).
- [x] **Tests:** minimal coverage — e.g. assert footer links exist on auth pages and Settings references resolve to the correct paths (**`*.test.tsx`** where those pages already have tests).

## Manual full-system test checkpoints

Run these when you want to exercise the **whole stack** (Compose, nginx, **messaging-service**, **web-client**, MongoDB, Redis, RabbitMQ, MinIO, optional coturn). Use **after** major merges, **before** demos, or when debugging cross-cutting issues. (Automate later if useful.)

- [ ] **Compose bring-up:** `docker compose -f infra/docker-compose.yml up -d --build` — `docker compose ps` shows expected containers; **`README.md`** host/port match your test.
- [ ] **HTTP health:** **`GET /v1/health`** and **`GET /v1/ready`** via nginx entry (e.g. **`http://localhost:8080`**) — **200** when dependencies are up; **`/v1/ready`** reflects MongoDB, Redis, RabbitMQ, S3 as configured.
- [ ] **Swagger:** **`/api-docs`** loads; spot-check a **public** route, then **Authorize** with a Bearer token and hit a protected route.
- [ ] **Web client:** `npm run dev` in **`apps/web-client`** _or_ static **`dist/`** behind nginx — app shell loads; browser **Network** tab shows API calls to expected **`VITE_API_BASE_URL`** / proxy.
- [ ] **Auth path:** register + login **or** login only — session survives refresh (refresh token); **logout** clears client storage as designed; optional: **`EMAIL_VERIFICATION_REQUIRED=true`** path documented in **`README.md` (Configuration)**.
- [ ] **Socket.IO:** client reaches **connected** (UI or worker); no repeated **401** loops; **presence:heartbeat** only if **Feature 6** path is enabled.
- [ ] **Quality gates:** `npm run lint` + `npm run typecheck` in **`apps/web-client`** and **`apps/messaging-service`** (and **`npm run test`** where UI **`*.tsx`** tests exist).

When **Feature 1** messaging and later features land, also run the **Definition of done (MVP smoke)** checklist (above) end-to-end.

---

## Product polish & bugfix backlog — Ekko / UX (debug & fix)

Tracked work for **search layout**, **E2EE display**, **calls UX**, **theme control**, **media attachments**, **conversation titling**, **guest → register**, and **product rename to Ekko**. Split into investigatory subtasks so each item can be closed in a small vertical slice.

### (B) Web-client — Search: results in conversation shell (no modal)

- [x] **Remove modal for search results:** Stop opening a separate **`<dialog>`** / modal for search from **`HomeConversationShell`**; search is not a floating modal.
- [x] **Layout (WhatsApp-style):** **`UserSearchBar`** pinned to the **top of the left column**; while a valid debounced query is active, **`UserSearchResultsPane`** **replaces** **`ConversationList`** below it. The **thread** occupies the **right** column only (no search in the thread pane). Preserve responsive behavior and loading / empty / error states.
- [x] **Result click → thread with recipient:** On selecting a **user search result**, open the **1:1 message view** — **`setActiveConversationId`** when **`conversationId`** exists, or **`setPendingDirectPeer`** + **`NewDirectThreadComposer`** in the thread pane when there is no DM yet; search field resets after navigation (debounced value clears immediately on reset).
- [x] **Tests & a11y:** **`UserSearchPanel.test.tsx`** (standalone card), **`HomeConversationShell.test.tsx`** (bar + list column), **`HomePage.test.tsx`** — **`data-testid`** **`user-search-bar`** / **`user-search-results`**; keyboard navigation on **`UserSearchResultList`** unchanged; no **`aria-modal`** trap for search.

### (B) Web-client + crypto — Message encryption / plaintext display (ciphertext visible)

- [x] **Reproduce & trace:** **`e2eeInboundDecryptTrace.ts`** documents the pipeline. **Raw `body`:** only when **`!isMessageWireE2ee`** (**`resolveMessageDisplayBody`** returns wire string) — e.g. base64-like text without legacy/hybrid shape; see **`messageDisplayBody.test.ts`**. **Classified E2EE peer rows:** **`usePeerMessageDecryption`** sets inline errors (**`PEER_DECRYPT_*`**) when local key missing, **`encryptedMessageKeys[deviceId]`** missing (**`decryptMessageBody`** not reached), or unwrap/decrypt throws — not raw ciphertext. **Dev:** `VITE_DEBUG_PEER_DECRYPT=true` logs branch + **`messageId`**. Inbound uses **`usePeerMessageDecryption`** → **`messageHybrid.decryptHybridMessageToUtf8`** → **`decryptMessageBody`**; **`useDecryptMessage`** is the same crypto stack but not wired to inbound UI. **`cryptoSlice` / `registerDevice`** supplies **`deviceId`** for **`getStoredDeviceId`**.
- [x] **Send path:** **`e2eeOutboundSendTrace.ts`** — **`useSendEncryptedMessage`** → **`mergeHybridDeviceRows`** (recipient + **`me`**) → **`encryptUtf8ToHybridSendPayload`** → **`message:send`** with **`body`**, **`iv`**, **`algorithm`** (**`MESSAGE_HYBRID_ALGORITHM`**), **`encryptedMessageKeys`**. **`messaging-service`** **`sendMessageForUser`** / **`insertMessage`** persist the same fields opaquely (**`docs/openapi/openapi.yaml`** **`SendMessageRequest`** / **`Message`**). Tests: **`messageHybrid.test.ts`** (two-device round-trip), **`useSendEncryptedMessage.test.tsx`** (hybrid socket payload); integration smoke **`messagingSocket.integration.test.ts`** (hybrid persistence).
- [x] **Receive path:** **`e2eeReceiveTrace.ts`** — REST/SWR + **`message:new`** → **`messagesById`**; **`usePeerMessageDecryption`** runs after load/realtime (depends on **`peerInboundSig`**, **`crypto.deviceId`**). **`getStoredDeviceId`** / **`registerDevice`** bootstrap; **`shouldRetryPeerDecryptAfterCachedFailure`** re-attempts hybrid rows stuck on **`PEER_DECRYPT_NO_DEVICE_KEY_ENTRY`** after **`deviceId`** exists. **`device_sync_complete`** → **`revalidateConversationMessagesForUser`** refetches keys. Tests: **`peerDecryptRetry.test.ts`**.
- [x] **UX contract:** **`resolveMessageDisplayBody`** + **`looksLikeOpaqueCiphertextBody`** — never use raw base64-ish **`body`** as bubble text when unclassified; peer → **`PEER_DECRYPT_INLINE_UNAVAILABLE`** (**“Can’t decrypt on this device.”**), own → **`…`**. **`usePeerMessageDecryption`** failures use **`PEER_DECRYPT_*`** strings aligned with Feature 11 (B). **Dev:** **`VITE_DEBUG_MESSAGE_DISPLAY=true`** / **`VITE_DEBUG_PEER_DECRYPT=true`**.
- [x] **Tests:** **`messageDisplayBody.test.ts`**, **`messageBodyOpaqueHeuristic.test.ts`**, **`peerDecryptInline.test.ts`**, **`messageHybrid.test.ts`** (round-trip); malformed / incomplete wire → unavailable copy, not raw **`body`**.

### (B) Web-client — Calls: remote hangup → short “call ended” modal (3s)

- [x] **Detect peer hangup vs local hangup:** Use existing WebRTC / **`CallSessionDock`** / socket events to distinguish **remote end** from **user pressed hangup** (keep current hangup button + server behavior unchanged). **Done:** **`callSlice`** — **`lastSessionEndReason`**: **`remote`** (inbound **`webrtc:hangup`** in **`useWebRtcCallSession`**), **`local`** (user **`requestLocalEndCall`** after emit, **`rejectCall`**), **`system`** (errors, teardown, missing peer/socket). Hook returns **`lastSessionEndReason`** for UI. Tests: **`callSlice.test.ts`**.
- [x] **UI:** When the **other user** ends the call, show a **modal or prominent toast** (e.g. “The other participant ended the call”) — **auto-dismiss after ~3 seconds**; ensure it does not block indefinitely. **Done:** **`RemoteCallEndedToast`** in **`HomeConversationShell`** — fixed top banner, **`role="status"`**, **`clearCallSessionEndReason`** after **3s**; **`callSlice.clearCallSessionEndReason`**. Tests: **`RemoteCallEndedToast.test.tsx`**.
- [x] **Tests:** **`CallSessionDock.test.tsx`** (or equivalent) — assert modal appears on simulated remote hangup and clears after timeout; local hangup path unchanged. **Done:** **`CallSessionDock.test.tsx`** — dispatch **`hangupCall({ reason: 'remote' })`** with **`RemoteCallEndedToast`** + active preload → toast + **`advanceTimersByTime(3000)`**; **`hangupCall({ reason: 'local' })`** → no **`remote-call-ended-toast`**.

### (B) Web-client — Theme: toggle with night / day icons (“slider” affordance)

- [x] **Control design:** Replace plain dark/light control with a **toggle** that reads as a **slider** (thumb moves between sides) and uses **night + day** icons (moon/sun or equivalent from existing icon set).
- [x] **Behavior:** Toggle switches **`prefers-color-scheme` / theme** the same way as today; **persist** preference (existing storage/slice).
- [x] **a11y:** **`aria-pressed`** or **`role="switch"`**, visible label, keyboard operable.

### (B) Web-client — Attachments / images show “-” for sender and recipient

- [x] **Reproduce:** Send an image attachment; confirm both sides render **“-”** or broken preview — note **`message` API shape** (**`attachments`**, **`url`**, **`mediaId`**). **Findings:** OpenAPI **`Message`** / **`message:new`** use a single **`mediaKey`** (S3 object key), **not** `attachments[]`, **`mediaId`**, or an embedded **`url`** — **`POST /media/upload`** returns **`key`** + optional **`url`** for immediate display only. **Sender regression:** optimistic **`StoredMessage.mediaPreviewUrl`** (blob / API **`url`**) was **dropped** when merging the server ack (**`replaceOptimisticMessage`**) or **`message:new`**, so **`resolveMediaAttachmentDisplayUrl`** often had **no** `http(s)`/`blob` and **`getMediaPublicObjectUrl`** returned **`null`** without **`VITE_S3_PUBLIC_BASE_URL`** + **`VITE_S3_BUCKET`** → placeholder **“Attachment”** / failed **`img`** (recipient still depends on public URL or presigned path). **Fix:** preserve **`mediaPreviewUrl`** from the optimistic row when reconciling — **`mergeServerMessageWithOptimisticClientFields`** in **`messagingSlice`** + tests.
- [x] **Data path:** Trace **`POST /media/upload`**, message create payload, and **Socket.IO** **`message:new`** — ensure **attachment URLs** or **ids** round-trip for sender and recipient. **Traced:** upload returns **`key`** + optional **`url`**; **`SendMessageRequest` / `Message`** carry **`mediaKey`** only (no **`attachments`**, **`mediaId`**, or message-level **`url`**). **`messageDocumentToApi`** → **`message:new`** includes **`mediaKey`** (**`messageApiShape.test.ts`**). Client: **`parseMessageNewPayload`** keeps **`mediaKey`** (**`socketMessageNew.test.ts`**); **`hydrateMessagesFromFetch`** stores full **`Message`**; **`mergeServerMessageWithOptimisticClientFields`** keeps sender **`mediaPreviewUrl`**; **`mediaPublicUrl.ts`** JSDoc documents URL derivation (**`VITE_*`** must mirror API **`S3_PUBLIC_BASE_URL`** / **`S3_BUCKET`** for recipients).
- [x] **UI:** Fix **`MessageBubble`** / media renderer — correct field binding, optional **presigned URL** refresh, **CSP** / **`img src`** base URL (**`S3_PUBLIC_BASE_URL`** / nginx). **Implemented:** **`MessageBubble.tsx`** + trimmed **`mediaKey`** / **`ThreadMessageMedia`** in **`ThreadMessageList`**; **`ThreadMessageMedia`** resets on resolved URL change, **`referrerPolicy="no-referrer"`** for cross-origin **`img`**, one **cache-bust** retry for query-less public URLs (skips **`?…`** presigned), docs on presigned signatures; **`infra/nginx/nginx.conf`** **`Content-Security-Policy`** with **`img-src`** **`data:`** **`blob:`** **`https:`** **`http:`** + **`connect-src`** for API/socket.
- [x] **Tests:** Component or integration test: attachment message renders **image** (or link), not placeholder **“-”**. **Implemented:** **`ThreadMessageList.test.tsx`** — image row via **`mediaPreviewUrl`** (**`<img>`**, no **“Attachment”**); non-image **`mediaKey`** with S3 env (**“Open attachment”** link); existing case covers **“Attachment”** only when URL cannot be resolved.

### (B) Web-client — Conversation / chat titling: show user name, not “Direct message”

- [x] **Active chat header (thread):** Replace generic **“Direct message”** with the **other participant’s** **`displayName`** / **`username`** (fallback chain); ensure loading state while profile resolves.
- [x] **Conversation list (sidebar / list rows):** Same — row title shows **peer name** for 1:1 threads, not **“Direct message”** — shared selector or **`useConversationTitle`**-style helper.
- [x] **Edge cases:** Guest users, missing profile, self-DM if applicable — sensible fallback text.
- [x] **Tests:** Snapshot or RTL tests for header + list item titles. **Implemented:** **`HomeConversationShell.test.tsx`** — **`Conversation titling — list rows and thread header`** (peer **`displayName`**, explicit **`title`**, group title, missing-profile fallback + **`thread-header-title`**).

### (B) Web-client — Guest → Create account: modal closes immediately

- [x] **Reproduce:** From **guest session**, trigger **Create account** (banner / link); observe modal **flash** then disappear — note **React Strict Mode**, **route change**, **`useEffect`** cleanup, or **auth slice** reset. **Cause:** **`RegisterPage`** (and **`LoginPage`**) redirected whenever **`isAuthenticated`** was true; guests still have an access token, so they were sent straight to **`/`**. **Fix:** only auto-redirect when authenticated **and** **`!user.guest`**.
- [x] **State & routing:** Stabilize modal **`open`** state; avoid unmounting on first **`navigate`** or token refresh; consider **controlled dialog** at route level or **query param** for “register from guest”. **Implemented:** **`registerPathFromGuest()`** → **`/register?from=guest`** for guest-sourced links; **`RegisterPage`** / **`LoginPage`** redirect only when **`user !== null && user.guest === false`** (not on `!user?.guest` during transient null + token); optional **`data-register-from-guest`** on register root for tests.
- [x] **Tests:** **`useNotifications`** / banner tests or new test — open register from guest → modal stays until dismiss or successful navigation. **Implemented:** **`guestOpenRegisterFlow.test.tsx`** — guest session navigates to **`/register?from=guest`** from banner-only route and from **`HomePage`**; **`RegisterPage`** stays mounted (**email** / **Register** button, **`data-register-from-guest`**); no bounce back to home. (Banner link **`href`** still covered in **`GuestSessionBanner.test.tsx`**.)

### Cross-cutting — Rename product to **Ekko**

- [x] **Web-client:** **`index.html`** **`<title>`**, PWA **`manifest`** name/short_name if present, shell/header branding, login/register copy, **meta** tags, any **“Messaging”** / working title strings in **`apps/web-client`**.
- [x] **Homepage:** Place the logo from apps/web-client/src/assets/ekko-icon.svg horizontally before the title horizontally, matching the logo height with font size.
- [x] **Register,Signin,Guest Page:** Place the logo from apps/web-client/src/assets/ekko-icon.svg horizontally before the title vertically(centre aligned with text), matching the logo height with font size.
- [x] **Docs & config (as needed):** **`README.md`** title line, **`docs/PROJECT_PLAN.md`** title references where product name is user-facing — keep repo folder name **`messaging-system`** unless a separate rename is requested.
- [x] **Consistency sweep:** Grep for old product string; update **E2E** / snapshot tests that assert visible title.

### Backlog — Conversation ordering, guest labels, Cloudflare media, presence, scroll, client env

Tracked work for **conversation list ordering**, **guest display in headers**, **encrypted image URLs via Cloudflare R2-style uploads**, **last-seen freshness + placement**, **auto-scroll on realtime messages**, **profile picture uploads**, and **local env files**. Split into **(A) messaging-service / infra** and **(B) web-client** where applicable; **`*.tsx`** tests first per **`docs/PROJECT_PLAN.md` §14** where UI changes.

#### 1. Conversation list — move latest thread to top on send/receive (UI)

- [ ] **(B) Ordering:** On **outgoing** send (optimistic or server ack) and **incoming** **`message:new`**, update the **conversation list** so the affected thread **sorts to the top** by **last activity** (same rule as API if one exists), without **full page refresh**.
- [ ] **(B) State:** Keep **`conversations` list** / **SWR** **`mutate`** for **`GET /v1/conversations`** (or equivalent) aligned with the new order; avoid duplicate rows or flicker.
- [ ] **(B) Tests:** RTL — simulate new message for an existing conversation → row **moves to top** (or order assertion on visible titles / test ids).

#### 2. Guest account — conversation header: show display name; **username** as fallback (not “Unknown contact · …”)

- [ ] **(B) Reproduce:** Guest DM header shows **Unknown contact · &lt;id fragment&gt;** — trace **`ConversationListRow`**, **`HomeConversationShell`** thread header, **`userPublicLabel`** / peer profile selectors.
- [ ] **(B) Fix:** For **guest** peers, resolve label as **`displayName`** → **`username`** (from **guest entry** / **`User`**) → short stable fallback; ensure **`GET`** profile or list payloads include **`username`** / **`displayName`** for guests.
- [ ] **(A) (if needed)** OpenAPI + **`User`** / search payloads — confirm guest **username** is returned where the client reads peer labels.
- [ ] **(B) Tests:** **`userPublicLabel.test.ts`**, **`HomeConversationShell.test.tsx`** — guest peer shows **username** or **displayName**, not **Unknown contact** + raw id.

#### 3. Image preview — Cloudflare upload + pre-signed URL; encrypt media reference in message (like text)

- [ ] **(A) API:** Add **pre-signed URL** issuance for **client-direct upload** to **Cloudflare R2** (or compatible) — authenticated **`POST`/`GET`** route(s), short TTL, **Zod** + **OpenAPI**; document **server env** (**account id**, **bucket**, **API token** server-side only) in **`README.md`**, **`infra/.env.example`**.
- [ ] **(A) Message model:** Define how the **media locator** (URL or object key) is carried inside the **E2EE** payload (**`body`** ciphertext or agreed field) so the server only sees opaque bytes; align with **Feature 11** hybrid **`body` + `iv` + `encryptedMessageKeys`**.
- [ ] **(B) Client upload:** Integrate **Cloudflare**-compatible **direct upload** (SDK or **`fetch`** **`PUT`** to pre-signed URL); progress / cancel / errors.
- [ ] **(B) Send path:** After upload, **encrypt** the **retrievable media URL** (or key + base URL) with the **same per-message key** as plaintext; send via existing hybrid send pipeline.
- [ ] **(B) Receive path:** **Decrypt** payload; if **media URL** present, resolve **`img`** / preview (**`ThreadMessageMedia`**, **`MessageBubble`**); handle **URL expiry** (re-presign or public URL policy as designed).
- [ ] **(B) Tests:** Unit + RTL — round-trip **encrypt/decrypt** of media reference; smoke **&lt;img&gt;** **`src`** after decrypt (mock URL).

#### 4. Last seen — update periodically while the message window is open (not only on refresh)

- [ ] **(A) (verify)** Server **`presence:heartbeat`** + **`presence:getLastSeen`** / **`resolveLastSeenForUser`** — confirm **Redis/Mongo** **`lastSeenAt`** updates when heartbeats arrive (throttle window documented).
- [ ] **(B) Client — active thread:** While the **conversation thread** is **open** (and optionally **tab focused** / **`document.visibilityState`**), emit **`presence:heartbeat`** on the **existing cadence** or a **faster interval** where allowed by server throttle so the **peer’s** last-seen label **updates live**.
- [ ] **(B) Client — subscribe / invalidate:** On **`presence:*`** acks or events (if any), or **polling** fallback, **refresh** last-seen display in the **thread header** without full reload.
- [ ] **(B) Tests:** Hook or component test — focused chat → **heartbeat** / **`getLastSeen`** path invoked (mock socket).

#### 5. Last seen — remove from conversation list row; keep in message window only

- [ ] **(B) UI:** Remove **last seen** / **presence** snippet from **`ConversationListRow`** (and any **sidebar** list variant).
- [ ] **(B) UI:** Keep **last seen** (or **typing** / **online** if product merges them) in the **active thread header** only (**`HomeConversationShell`** / **`ThreadHeader`** area).
- [ ] **(B) Tests:** List row assertions — **no** last-seen text; thread header — **still** shows when data exists (**`HomeConversationShell.test.tsx`**).

#### 6. Auto-scroll — jump to latest message on **`message:new`** when that chat is open

- [ ] **(B) Behaviour:** When **`message:new`** applies to **`activeConversationId`**, scroll the **message list** to the **bottom** (newest message), unless the user has **scrolled up** intentionally (preserve existing **“new messages below”** / scroll-lock pattern if present).
- [ ] **(B) Implementation:** **`ThreadMessageList`** / container **`ref`** + **`scrollTop`** / **`scrollIntoView`** on new row; debounce if many events arrive quickly.
- [ ] **(B) Tests:** **`ThreadMessageList.test.tsx`** (or shell) — append message while active → **scroll** stub or **last child** visibility assertion.

#### 7. Profile picture — pre-signed URL upload via Cloudflare (**no** message-layer encryption)

- [ ] **(A) API:** Extend **`PATCH /v1/users/me`** (or dedicated **avatar** route) — server returns **pre-signed PUT URL**; after upload, client sends **final public URL** or **object key**; persist on **`User.profilePicture`**; **OpenAPI** + **Zod**.
- [ ] **(B) Settings UI:** **`SettingsPage`** — pick file → **PUT** to pre-signed URL → **PATCH** profile with resulting **URL/key**; loading/error states; **no** E2EE wrapper for avatar strings.
- [ ] **(B) Tests:** MSW / RTL — happy path + failed upload.

#### 8. Web-client `.env` for Cloudflare-related **public** config + gitignore

- [ ] **(B) Templates:** Add **`apps/web-client/.env.example`** entries for **`VITE_*`** vars that are **safe in the bundle** (e.g. **public** bucket base if required); document that **secrets** (**API tokens**, **R2 secret keys**) stay **server-only** — client never embeds them.
- [ ] **Gitignore:** Ensure local secret files are not committed — root **`/.gitignore`** already ignores **`.env`**; add **`.env`** to **`apps/web-client/.gitignore`** explicitly if desired for clarity; keep **`.env.local`** / **`.env.*.local`** as override pattern per existing repo policy.
- [ ] **Docs:** Short **`README.md`** (web-client or root) pointer — copy **`.env.example`** → **`.env.local`** for local Cloudflare-related **public** IDs.

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

- [x] **messaging-service (Redis + presence)** — `PROJECT_PLAN.md` §3.1: **hot** last-seen in Redis only while Socket.IO is up — client **`presence:heartbeat` ~every 5s** → **`setLastSeen`**; on **disconnect** → **`flushLastSeenToMongo`** (`users.lastSeenAt`) + Redis **`DEL`**. **`handshake.auth.userId`** required. **Socket.IO rooms** are **in-memory per process** only (**`PROJECT_PLAN.md` §3.2.2**); **do not** use **`@socket.io/redis-adapter`** for room sync — cross-node delivery uses **RabbitMQ** + local **`io.to(room).emit`**. **In-tab notifications** use the **same** RabbitMQ pub/sub path as **`message:new`** (topic exchange → per-replica queue → consumer → Socket.IO), not a parallel bus (**`PROJECT_PLAN.md`** §3.3).
  - [x] **Redis client** (`REDIS_URL` + `LAST_SEEN_TTL_SECONDS`); connect at startup; **graceful shutdown**; **`/v1/ready`** includes Redis ping
  - [x] **Presence pipeline** — **`src/data/presence/lastSeen.ts`**, **`src/data/presence/flushLastSeenToMongo.ts`**, **`src/utils/realtime/socket.ts`** (heartbeat throttle ~4.5s)
  - [x] **Feature 7 (notifications — server, via RabbitMQ):** **`§8`** **`notification`** for new messages **rides the same broker fan-out as 1:1 chat** — not Redis Streams (**DND/mute** post-MVP — **Feature 7** post-MVP subsection):
    - [x] **Persist + publish (sender A → recipient B):** after `insertMessage` in **`sendMessageForUser`**, **`publishMessage`** to topic exchange **`messaging.events`** with routing key **`message.user.<recipientUserId>`** (same API as **`message:new`** delivery — **`docs/TASK_CHECKLIST.md`** Cross-cutting — RabbitMQ (messaging-service)).
    - [x] **Subscribe / consume:** each **messaging-service** replica binds a **dedicated queue** to **`message.#`**; the consumer receives the published delivery for **B** (same **pub/sub** pattern as chat).
    - [x] **Socket last mile:** consumer decodes the **`Message`**, emits **`message:new`**, builds **`notification`** ( **`kind: "message"`**, `notificationId`, `occurredAt`, `conversationId`, `messageId`, `senderUserId`, `preview`, …) and **`io.to('user:<B>').emit('notification', …)`** — user **B**’s client joined **`user:<B>`** on connect.
    - [x] **Sender echo:** separate publish **`message.user.<A>`** with **`{ message, skipSocketId }`** — consumer emits **`message:new`** only (no **`notification`** for that path).
    - [x] **Group (when wired):** routing **`message.group.<groupId>`** → room **`group:<groupId>`** for **`message:new`** + **`notification`** (same consumer file; publish when group messaging exists).
    - [x] **Web-client** uses **`kind`** for **alert audio** (e.g. **`message`** vs **`call_incoming`**).
  - [x] **Feature 6 (read — WebSocket):** **`presence:getLastSeen`** + ack — **`resolveLastSeenForUser`** (`src/presence/resolveLastSeen.ts`): Redis → Mongo → **`{ status: 'not_available' }`**

- [x] **messaging-service (S3 / static uploads)** — **`POST /v1/media/upload`** via **`@aws-sdk/client-s3`** + **`@aws-sdk/lib-storage`** (`Upload`); **MinIO** in Compose; object keys for messages still **Cross-cutting — Media** (MongoDB wire-up)

- [ ] **Docker Compose, nginx, TLS, deployment**
  - [x] **`docker compose`**: **`infra/docker-compose.yml`** — **messaging-service** (image build), MongoDB, Redis, RabbitMQ, MinIO, **nginx** (entry **`http://localhost:8080`**); optional **coturn** — `docker compose -f infra/docker-compose.yml --profile turn up -d`
  - [x] nginx: reverse-proxy REST + **Socket.IO** to **messaging-service** with upgrade headers (`infra/nginx/nginx.conf`)
  - [x] nginx: serve **`apps/web-client/dist/`** as **static root** (SPA fallback **`index.html`**) — **`infra/nginx/nginx.conf`** + Compose volume or build args
  - [ ] **TLS:** terminate HTTPS (cert paths, HSTS policy) — nginx or outer load balancer; document **`README.md`** (Configuration section)
  - [ ] **Production WebRTC hardening** (TURN creds rotation, firewall notes) — beyond dev **coturn** profile
  - [x] Document hostnames, ports, one-command bring-up — root **`README.md`**, **`infra/.env.example`**

### (B) Web-client, UI, tests & state management

- [x] **web-client (skeleton)**
  - [x] Scaffold with **Vite** + **React** + **TypeScript** under `apps/web-client` — **`tsconfig.json`** project references + **`tsconfig.app.json`** / **`tsconfig.node.json`**; **`vite.config.ts`**, **`index.html`**, **`src/main.tsx`**, **`eslint.config.mjs`**, **`.prettierrc.json`** — all **inside `apps/web-client` only**
  - [x] Strict TS (`tsconfig.app.json` — `strict`, unused locals/params, etc.) per **`docs/PROJECT_PLAN.md` §14** §1.1
  - [x] **Tailwind CSS v4** + **themes** — **`@tailwindcss/vite`**, **`tailwind.config.ts`**, semantic tokens + **`@theme`** in **`src/index.css`** (`background`, `foreground`, `surface`, `accent`, `border`, `muted`, `ring`, `radius-card`, `shadow-card`); **class-based dark mode** (`html.dark`) + **`ThemeProvider`** / **`useTheme`** / **`ThemeToggle`** + **`localStorage`** (`messaging-theme`); `prettier-plugin-tailwindcss` in **`.prettierrc.json`**
  - [x] **ESLint** (`typescript-eslint`, **`eslint-plugin-react-hooks`**, **`eslint-plugin-react-refresh`**); **Prettier**; optional a11y plugin later
  - [x] **react-router** + **`src/common/utils/apiConfig.ts`** (**`VITE_API_BASE_URL`**, **`getApiBaseUrl`** / **`getSocketUrl`**) + **`App`/`main`** wiring
  - [x] **Vite:** dev **proxy** to API + **`build.outDir`** (`dist/`) for nginx — **`vite.config.ts`**
  - [x] **Socket.IO in a Web Worker:** **`src/workers/socketWorker.ts`** + **`src/common/realtime/socketBridge.ts`** (`postMessage` to main thread)
  - [x] **Presence hook:** **`emit('presence:heartbeat')` every 5s** while connected — **`src/common/hooks/usePresenceConnection`** (**Feature 6**)
  - [x] **Vitest** + **React Testing Library** + **jsdom** (`npm run test` / `test:watch`); **`src/setupTests.ts`**; example **`*.tsx`** component test (**`ThemeToggle`**); mandatory tests only for UI **`*.tsx`** per \***\*`docs/PROJECT_PLAN.md` §14** §4.1.1**; **no** client env-based user impersonation for Socket.IO (identity from session only, per \*\***`docs/PROJECT_PLAN.md` §14\*\* §4.1)
  - [x] **Static assets / uploads (images, etc.):** follow **Cross-cutting — Media (AWS S3)** (**no AWS SDK in the browser**)
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
  - [x] **Fixtures:** **`__fixtures__/`** or factories for **`User`**, **`AuthResponse`**, list payloads
  - [x] **Security:** no **`VITE_*`** fake user IDs in tests — mock **HTTP** session/**401** only (**`docs/PROJECT_PLAN.md` §14** §4.1)

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
  - [x] **UI:** **`ConnectionStatusIndicator`** (`*.tsx`) — label + icon/badge; **tests first** per \***\*`docs/PROJECT_PLAN.md` §14** §4.1.1\*\*

### Web-client — Home & messaging UX (planned fixes)

**Goal:** Address layout, chat-shell patterns, E2EE bootstrap, demo copy removal, and search semantics. Execute as separate PRs where possible; update **OpenAPI** when REST contracts change.

- [x] **Home layout — full width on large screens with `2rem` margins**
  - [x] **`HomePage`** (and any outer wrapper): remove or relax **`max-w-*`** constraints so the authenticated shell **uses available viewport width** on tablet/desktop while keeping **`2rem` (`mx-8` or equivalent)** horizontal margins — align with \***\*`docs/PROJECT_PLAN.md` §14** §4.2.1\*\* (responsive breakpoints).
  - [x] Verify **no horizontal overflow** at common widths (~390 / 768 / 1024+); adjust padding on **`main`** / header as needed.
  - [x] Update **`HomePage.test.tsx`** (or add RTL checks) if layout structure or visible copy changes.

- [x] **Conversation + thread — WhatsApp-style shell**
  - [x] **Left column:** **`UserSearchBar`** on top, then **conversation list** or **user search results** (same column); on narrow viewports with **no** chat open, this column is **stacked first** so search + list lead the layout.
  - [x] **Right column:** active **thread** (message list + composer) or empty state **only** — no search strip here; sensible **min widths**, **scroll** regions, and **mobile** master–detail (back to list; list hidden while thread open).
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
  - [x] **(A) messaging-service:** evolve **`GET /users/search`** (or documented replacement) from **exact email** to **similarity** / **substring** / **prefix** matching (define scoring or ordering — e.g. MongoDB regex + index strategy per \***\*`docs/PROJECT_PLAN.md` §14** §2**); keep **rate limits** and **Zod** validation; update **`docs/openapi/openapi.yaml`** + controller/validation in the **same PR\*\*.
  - [x] **(B) web-client:** **`usersApi`** / **`UserSearchPanel`** — debounce, placeholder, and **empty-state** copy reflecting **partial** match; **MSW** handlers + tests (`**usersApi.test.ts**`, **`HomePage.test.tsx`**).
  - [x] **Security / abuse:** avoid overly broad queries; cap result count; document behaviour in **`README.md`** (Configuration section) if new env vars are required.

- [x] **Product polish / UX backlog (observations)** — execute as separate PRs; **OpenAPI + Zod** when REST contracts change; **`*.tsx`** tests first per **`docs/PROJECT_PLAN.md` §14** §4.1 / §4.1.1 where UI changes.
  - [x] **Viewport & shell — full window height, no page overflow**
    - [x] Constrain authenticated layout (**`HomePage`**, **`main`**, root flex) to **available viewport height** (**`100dvh` / `100vh`** + **`min-h-0`** flex children) so the **document/body does not scroll**; only inner panes (list, thread, composer area) scroll.
    - [x] Smoke at ~390 / 768 / 1024+ widths: **no accidental vertical overflow** on the outer shell.

  - [x] **Register — display name + unique username; search by username or email**
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

  - [x] **Read receipts — avoid emitting `message:read` / `conversation:read` when already read**
    - [x] **Symptom:** client emits **`message:read`** / **`conversation:read`** over Socket.IO even when the message or thread is **already marked read** (REST **`GET …/message-receipts`** or **`receiptsByMessageId`** shows **seen** for the current user).
    - [x] **(B) web-client — guards:** in **`HomeConversationShell`** (or **`useConversation` / receipt hook):** before **`emitReceipt('message:read')`**, skip if **`receiptsByMessageId[messageId]`** already records **current user** as **seen** (per OpenAPI **`MessageReceiptSummary`** shape); before **`conversation:read`**, skip if **last message** / cursor already has **read** state aligned with server (avoid re-emit on **SWR revalidate** / **focus** when state unchanged).
      - **Done:** **`receiptEmitGuards.ts`** — **`currentUserHasSeenMessage`**. **`HomeConversationShell`** — **`onPeerMessageVisible`**: skip + mark **`messageReadEmittedRef`** when **`receiptsByUserId[userId].seenAt`** set; **`conversation:read`** effect: when **last** message is **from peer** and **current user** already **seen**, **skip** emit and **set** cursor ref (no duplicate after SWR receipt hydrate). **Last message own** — no **seen** guard (per-message receipts are peer→reader; cursor still deduped by ref). **Tests:** **`receiptEmitGuards.test.ts`**, **`HomeConversationShell.test.tsx`** (mock **`useSocketWorker`** / **`useConversation`**).
    - [x] **Refinement:** keep **`messageReadEmittedRef`** for in-session dedupe but **hydrate** “already read” from **`mergeReceiptSummariesFromFetch`** so reload does not re-flood; clear refs only when appropriate (conversation switch already clears).
      - **Done:** **`hydratePeerReadDedupeFromReceipts`** in **`receiptEmitGuards.ts`**; **`HomeConversationShell`** — **`useLayoutEffect`** seeds **`messageReadEmittedRef`** / **`conversationReadCursorKeyRef`** from **`receiptsByMessageId`** after **`mergeReceiptSummariesFromFetch`**; **conversation-switch** clear moved to **`useLayoutEffect`** so it runs **before** hydration (same tick as **`activeConversationId`** change). **Tests:** **`receiptEmitGuards.test.ts`**.

  - [x] **E2EE — own messages after full reload (sender sees plaintext, not wire ciphertext)**
    - **How production messengers usually behave (e.g. WhatsApp):** the **sending device already had plaintext** when the user hit send; the app **persists message history in a local encrypted store** on the phone. After restart, the thread reads from **that local store**, not from “decrypt the server’s stored blob as the sender.” **Multi-device** adds encrypted sync between devices — still **not** “upload the user’s **private** key to our database.”
    - **Why “user key in MongoDB” is the wrong lever:** the **public** directory key **does** belong in the DB (**`GET /users/{id}/public-key`**). The **private** key must **never** be stored server-side. **`E2EE_JSON_V1`** ciphertext is for the **recipient**; the **sender cannot decrypt** it with their own private key, so **`GET /conversations/.../messages`** alone cannot restore “what I typed” without **local durability** of sender copy and/or a **protocol** that includes a sender-readable ciphertext.
    - [x] **Doc:** add a short subsection to **`docs/PROJECT_PLAN.md`** (E2EE / messaging) or **`README.md`**: (1) public vs private key placement; (2) same pattern as above — local durability vs wire-only; (3) link **`messageEcies`** / **`E2EE_JSON_V1`**; (4) optional footnote that optional **cloud backup** (outside core E2EE) is a separate product decision.
    - [x] **Option A — local sender-plaintext durability (incremental, no protocol change):** treat **`senderPlaintextByMessageId`** as the in-memory leg of **WhatsApp-style local history**; persist **`messageId` → plaintext** to survive full reload; merge on hydrate when **`senderId === self`** and wire **`body`** is E2EE. **Subtasks:**
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

- [x] **Documentation & conventions**
  - [x] Update \***\*`docs/PROJECT_PLAN.md` §14\*\*** (file layout / imports / testing paths) to match **`PROJECT_PLAN.md` §10.1** — replace references to flat **`src/pages/`**, **`src/api/`**, **`src/features/`** with **`common/*`** and **`modules/*`** once migration lands (**§1.2**, **§4.0**, **§4.1.2**, **§4.2**, **§4.3**)
  - [x] Update **`.cursor/rules/web-client.mdc`** (and any README under **`apps/web-client`**) with new import examples and folder rules
  - [x] **Decide once:** route path constants live in **`src/routes/`** only vs **`common/constants/routes`** — **decision:** **`src/routes/`** only (**`paths.ts`** etc.); documented in \***\*`docs/PROJECT_PLAN.md` §14** §4.0\*\*

- [x] **Scaffold `common/`**
  - [x] Create **`src/common/api/`**, **`src/common/components/`**, **`src/common/constants/`**, **`src/common/types/`**, **`src/common/utils/`** (add minimal **`index.ts`** barrels only where the codebase already uses barrels — avoid empty noise — **`common/api/index.ts`** retained; other dirs have **no** empty barrels)
  - [x] Optional: **`src/common/hooks/`** for shared React hooks if not colocated under **`utils`** (align with §10.1) — **`useAuth`**, **`usePresenceConnection`** moved from **`src/hooks/`**

- [x] **Move shared / cross-cutting code into `common/`**
  - [x] Move **`src/api/**`** → **`src/common/api/**`** (including **`httpClient`**, **`API_PATHS`**, feature API modules, **`README.md`**); update **`openapi-typescript`** output path only if codegen scripts reference **`src/api`** — **default:** keep **`src/generated/`** at **`src/`** root per §10.1
  - [x] Move **`src/config/`** (e.g. **`api.ts`**) → **`common/constants`** or **`common/utils`** per usage — **`src/common/utils/apiConfig.ts`** (**`getApiBaseUrl`**, **`getSocketUrl`**; env accessors are **utils**, not static constants)
  - [x] Move shared **`src/components/**`** → **`src/common/components/**`**
  - [x] Move shared **`src/lib/**`** into **`common/utils`** as appropriate (**`src/hooks/**`** → **`src/common/hooks/`** done) — **`formValidation.ts`**, **`presenceLabel.ts`** → **`src/common/utils/`**
  - [x] Move shared **`src/types/**`** → **`src/common/types/**`** where still client-local (OpenAPI types remain **`src/generated/`**) — **`axios-auth.d.ts`** (Axios module augmentation)

- [x] **Scaffold `modules/` and migrate by feature**
  - [x] For each route / feature (e.g. **home**, **settings**, **auth**), create **`src/modules/<module-id>/`** with **`components/`**, **`stores/`**, **`api/`**, **`constants/`**, **`utils/`**, **`types/`**, and **`pages/`** (or **`Page.tsx`**) — **use one naming convention** for page files across modules — **done:** **`modules/home`**, **`modules/settings`**, **`modules/auth`** (**`*Page.tsx`** in **`pages/`**); layout per **`docs/PROJECT_PLAN.md` §10.1**
  - [x] Migrate **`src/pages/*`** into the corresponding **`modules/*/pages/`** (or module root) — **`home`**, **`settings`**, **`auth`**; **`App.tsx`** + **`common/integration/msw.integration.test.tsx`** updated; ESLint **`src/modules/**/pages/**`**
  - [x] Migrate **`src/features/auth/**`** (and other feature folders) into **`modules/<auth-module-id>/`** — split **`login`** / **`register`** submodules if that matches routing — **single `modules/auth`**: **`stores/`** (slice + selectors), **`utils/`** (apiError, applyAuthResponse, authStorage, sessionBootstrap), **`components/`** (SessionRestore); login/register/verify **pages** stay in **`modules/auth/pages/`\*\*
  - [x] Move **`src/realtime/`**, **`src/theme/`**, etc., to **`common/`** or the owning **`module/`** based on §10.1 rules of thumb (shared vs single-feature) — **`src/common/realtime/`**, **`src/common/theme/`** (used app-wide, not single module)

- [x] **Redux & app shell**
  - [x] Colocate slice files under **`modules/*/stores/`**; keep **`src/store/`** for **`configureStore`**, **`rootReducer`**, and wiring imports from modules — **`modules/auth/stores/`** (auth + selectors); **`modules/app/stores/appSlice.ts`** (shell placeholder **`app`** reducer); **`store/store.ts`** wires **`app`** + **`auth`**
  - [x] Update **`main.tsx`**, **`App.tsx`**, **`routes/**`** lazy imports and **`ProtectedRoute`** paths — **`routes/lazyPages.ts`** (**`React.lazy`** per module page), **`routes/RouteFallback.tsx`** + **`Suspense`** in **`App.tsx`**; **`ProtectedRoute`** unchanged (**`ROUTES`** from **`paths.ts`\*\*)

- [x] **Tooling & quality gates**
  - [x] **`tsconfig.app.json`** / **`vite.config.ts`**: add or adjust path aliases (**`@/common/*`**, **`@/modules/*`**) if used; ensure **`vitest`** / **`@` imports** resolve
  - [x] **`eslint.config.mjs`**: refresh **`no-restricted-imports`** (forbid **`httpClient`** outside **`common/api`**, etc.) for new paths
  - [x] Move **`src/mocks/`**, **`src/test-utils/`**, **`src/integration/`** only if needed; **update all imports** in tests and **`setupTests.ts`**
  - [x] Co-locate **`*.{test,spec}.tsx`** with moved components/pages; fix **`vi.mock`** paths

- [x] **Verification & cleanup**
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
- [ ] **Write path:** an internal **admin API**, and a seed script to update toggles (authz TBD); the internal admin API should be accessible by a server_secret present in server env, which can be passed as authorization header for the API
- [ ] **Docs:** **`README.md`** (Configuration section) — which env keys are **deprecated** / **override-only** vs **DB-owned**; **`docs/PROJECT_PLAN.md`** and **`README.md`** — align **TTL** (30 min) and **refresh** rules when implemented
- [ ] **Tests:** unit/integration for fallback **env → DB** and disabled guest / email verification branches

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
  - [x] **Email mandatory / separate from guest:** **`email`** remains **required** on **`RegisterPage`** and in client validation; **guest** username/session is **only** via **Feature 2a** — **dedicated guest page** + **`POST /auth/guest`**, **not** via register or shared guest+register form.
- [x] **Register — profile picture (UX):** **file** input primary (**`accept`** image/\*, **`REGISTER_AVATAR_MAX_BYTES`**); after **`registerUser`** when **`accessToken`** present, **`PATCH /users/me`** via **`updateCurrentUserProfile`** (same **`SettingsPage`** S3 path); optional **URL** in **advanced** **`details`**; toasts when photo cannot be applied until **Settings** — **`RegisterPage`**, **`formValidation`**
- [x] **Login flow:** form + **`login`** + **`applyAuthResponse`**; handle **403** “email not verified” vs **401** — **`LoginPage`**, **`parseLoginError`** in **`modules/auth/utils/apiError`**
- [ ] **Forgot / reset password** _(deprioritized for now — backend routes exist; web-client screens later):_ **`forgotPassword`** + **`resetPassword`** (token from **email link** / query param)
- [x] **Verification UX when `User.emailVerified` is `false`:** **`verifyEmail`** + **`resendVerificationEmail`** screens (state from register or **`getCurrentUser`**) — **`VerifyEmailPage`**, **`ROUTES.verifyEmail`**, **`applyVerifyEmailResponse`**
- [x] **Redux `auth`:** ensure **`user.emailVerified`** populated; after register, route to app vs “check your email” — **`selectEmailVerified`**, **`useAuth`**, **`RegisterPage`** / **`HomePage`** redirect to **`/verify-email`** when unverified
- [x] **Protected routes:** wrapper or loader — unauthenticated → **`/login`**; post-login redirect — **`ProtectedRoute`**, **`postLoginRedirect.ts`**, **`App.tsx`** nested route; login/register/verify preserve **`state.from`**
- [x] **Session restore:** on app load, **`getCurrentUser`** (or refresh) if refresh token present — **`main`/`App`** bootstrap — **`SessionRestore`**, **`sessionBootstrap.ts`** (**`refreshTokens`** → **`getCurrentUser`**)
- [x] **Settings / profile:** **`PATCH /users/me`** via **`updateCurrentUserProfile`** (FormData: image + **status** + **displayName**) — **`SettingsPage`**, **`ROUTES.settings`**
- [x] **Tests first (`*.tsx`):** one screen per test file or shared **`renderWithProviders`** — RTL + MSW per \***\*`docs/PROJECT_PLAN.md` §14** §4.1.1** — **`src/common/test-utils/renderWithProviders.tsx`**, **`src/common/mocks/handlers.ts`** + **`server`**, **`SettingsPage.test.tsx`**, **`HomePage.test.tsx`**, **`src/common/components/ThemeToggle.test.tsx`\*\*
- [x] **Form validation UX** (client) + **API** error mapping (`code` / `message`) — **`lib/formValidation.ts`**, **`parseApiError`** / **`ApiErrorAlert`**, auth + **`SettingsPage`**

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

## Feature 1 — One-to-one text messaging

### (A) Infra, backend & deployment

- [x] Depends on **Prerequisite — User keypair** for ciphertext fields and public-key APIs when E2EE is enabled — **`Message.body`** / **`SendMessageRequest.body`** documented as opaque (plaintext or E2EE ciphertext); **`info`** + schema **`description`** in **`docs/openapi/openapi.yaml`** **`0.1.18`**; **`sendMessageForUser`** JSDoc; **`npm run generate:api`** → **`apps/web-client/src/generated/api-types.ts`**
- [x] **MongoDB:** **`conversations`** + **`messages`** collections; indexes per \***\*`docs/PROJECT_PLAN.md` §14** §2.0** — **`CONVERSATIONS_COLLECTION`** / **`MESSAGES_COLLECTION`**; **`ensureConversationIndexes`** (`id`, partial **`directPairKey`**, **`participantIds` + `updatedAt` + `id`** for list-by-participant); **`ensureMessageIndexes`** (compound **`conversationId` + `createdAt` + `id`**, unique **`id`**); access-pattern table comments in **`conversations.collection.ts`** / **`messages.collection.ts`**; startup in **`index.ts`\*\*
- [x] **`POST /messages`:** **`validateBody`** + service — **lazy-create** direct conversation when **`conversationId`** omitted + **`recipientUserId`** set (**Cross-cutting** — interim REST; **Socket.IO** send — **Send path — Socket.IO (target)**)
- [x] **1:1 messaging — send (Socket.IO) + list (REST):**
  - [x] **Socket.IO send:** client-originated **send** via **Socket.IO** (reuse **`sendMessageForUser`**) — **`src/utils/realtime/socket.ts`** **`message:send`** — **`sendMessageRequestSchema.safeParse`**, **`isMessageSendRateLimited`**, **`sendMessageForUser`**, ack **`messageDocumentToApi`** / **`AppError`** (same contract as **`POST /v1/messages`**)
  - [x] **`GET` conversation messages:** **`listMessages`** — cursor + **`limit`**; authz (**participant** only)
- [x] **Socket.IO — user room join:** on connection auth success call **`socket.join('user:' + userId)`** in the **`connection`** handler (`src/utils/realtime/socket.ts`) — **in-memory on this process only** (**`PROJECT_PLAN.md` §3.2.2**); without this every `io.to('user:<userId>').emit(…)` on this node is a silent no-op (`PROJECT_PLAN.md` §3.2.1)
- [x] **RabbitMQ — publish API:** export a **`publishMessage(routingKey, payload)`** function from **`src/data/messaging/rabbitmq.ts`** so callers can publish without accessing the private `channel` singleton; guard against calling before `connectRabbit` resolves (shared **`connectPromise`** + throws if never connecting)
- [x] **RabbitMQ (1:1) — publish after persist:** in `sendMessageForUser` (`src/data/messages/sendMessage.ts`), after `insertMessage` resolves, call the publish API with routing key **`message.user.<recipientUserId>`** — **one publish per persisted message** (`PROJECT_PLAN.md` §3.2.1)
  - [x] **Sender multi-device echo:** also publish to **`message.user.<senderId>`** (envelope **`{ message, skipSocketId? }`**) so the sender's other sessions get **`message:new`**; **`message:send`** passes **`originSocketId`** → consumer uses **`io.to('user:…').except(skipSocketId).emit`** (same idea as **`socket.to(room)`**)
- [x] **RabbitMQ consumer — wire `io`:** **`setMessagingSocketIoServer(io)`** in **`index.ts`** after **`attachSocketIo`**; cleared on shutdown — **`src/data/messaging/rabbitmq.ts`**
- [x] **RabbitMQ consumer — implement emit:** parse **`message.user.<userId>`** → **`io.to('user:<userId>').emit('message:new', payload)`**; on the **recipient** fan-out (flat **`Message`**, no **`skipSocketId`**) also emit **`notification`** (§8 **`kind: "message"`**) — **Feature 7**; envelope with **`skipSocketId`** uses **`.except(skipSocketId)`** for **`message:new`** only (no **`notification`** on sender echo); **`ack`** after delivery attempt (`PROJECT_PLAN.md` §3.2)
- [x] **Socket.IO Redis adapter — deprecate / guard:** intended architecture uses **in-memory rooms** + **RabbitMQ** per replica (**`PROJECT_PLAN.md` §3.2.2**), not **`@socket.io/redis-adapter`**. Wiring remains for edge cases; default **`SOCKET_IO_REDIS_ADAPTER=false`** with **startup `warn`** if enabled (**`socket.ts`**), **`README.md`** (Configuration section) + **docker-compose** comments discourage enabling it
- [x] **Integration test / manual checklist:** automated **`npm run test:integration`** (`src/integration/messagingSocket.integration.test.ts`) — A→B **`message:new`**; **one** `publishMessage` to **`message.user.<B>`** plus **one** sender echo to **`message.user.<A>`**; manual two-replica steps in **`README.md` (manual integration steps)**
- [x] **OpenAPI** for messaging: **`docs/openapi/openapi.yaml`** **`0.1.18`** — **`Message`**, **`SendMessageRequest`**, **`GET/POST` messaging**, **`GET /conversations/{id}/message-receipts`** + **`message:new`** / Socket.IO narrative; **`429`** for rate limits; **`npm run generate:api`** in **`apps/web-client`**
- [x] If shipping **Feature 12** in the same release as Feature 1, add **receipt-related** fields to the message schema early; otherwise **Feature 12** may introduce a migration — **done:** **`MessageDocument.receiptsByUserId`** + **`MessageReceiptEntry`** in **`messages.collection.ts`** (optional on insert; receipt updates use **`$set`** on nested paths — **no** backfill migration for existing rows); **`conversation_reads`** + indexes at Feature 12 — see **Feature 12 (A)** MongoDB line

### (B) Web-client, UI, tests & state management

- [x] **Tests first (`*.tsx`):** conversation **list** row; **thread** message list; **composer** — RTL per \***\*`docs/PROJECT_PLAN.md` §14** §4.1.1** — **`ConversationListRow.test.tsx`**, **`ConversationList.test.tsx`** (empty / loading / error), **`ThreadMessageList.test.tsx`** (empty / loading / error + log), **`ThreadComposer.test.tsx`** (send + errors); **no** demo preview on **`HomePage`\*\*
- [x] **UI — shell:** conversation list layout + active selection state
- [x] **UI — thread:** scroll container, message bubbles, timestamps
- [x] **UI — composer:** text input, send button, disabled/loading
- [x] **Redux:** active **`conversationId`**, normalized **`messagesByConversationId`**, send **pending/error** flags
- [x] **`useConversation` / `useSendMessage`:** call **`listMessages`** (REST or future read path); **send** via **Socket.IO** (**not** HTTP **`POST /messages`** for primary UX — **Send path — Socket.IO (target)**) + optimistic updates
- [x] **Socket.IO — receive:** listen for **`message:new`** events (emitted by the RabbitMQ consumer via `io.to('user:<userId>')`) in the **`socketWorker`** / **`socketBridge`**; dispatch to Redux; **dedupe** by **`messageId`** before rendering (`PROJECT_PLAN.md` §3.2.1)
- [x] **Optimistic vs server:** reconcile temp ids with server **`Message.id`**
- [x] **Loading / empty / error** states; **chat** **`role="log"`** / **`aria-live`** where appropriate
- [x] **E2EE messaging indicator (product):** small, non-blocking component in the **chat / thread** area (e.g. near composer or thread header) that states messages are **end-to-end encrypted**, consistent with **`docs/PROJECT_PLAN.md`** (opaque payloads on real-time path; server routing without content visibility) and **`README.md`** and **`docs/PROJECT_PLAN.md` §14** (hybrid / ECIES, user-level keys). **No** reliance on a **Settings → encryption** screen. **Tests first** (`*.tsx`) per \***\*`docs/PROJECT_PLAN.md` §14** §4.1.1\*\*
- [ ] **Sent tick** (stub) or full **Feature 12** receipts when ready

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
- [ ] **Image fetch without public MinIO / anonymous bucket reads:** keep objects **private** in MinIO/S3; expose images to the browser via **one** of:
  - [ ] **(Preferred)** **`GET /v1/media/by-key`** (or **`…/presign`**) — authenticated user, authz that caller may read **`mediaKey`** (same conversation / participant rules as messaging); response **redirect** or JSON with **short-lived presigned `GetObject` URL**; **OpenAPI** + **Zod** in same PR
  - [ ] **(Alt)** Stream **`GetObject`** through **messaging-service** (higher load; simpler than presign in some setups)
  - [ ] **Client:** build **`<img src>`** from that URL or blob; for **E2EE**, **`mediaKey`** in the message may be **opaque / encrypted** — **decrypt to key** (or fetch key from envelope) **before** requesting the media URL (**no** reliance on MinIO “public” policy for MVP)
- [ ] **Env / docs:** document that **`S3_ANONYMOUS_GET_OBJECT`** / public bucket policy is **optional** when using presigned/proxy GET; **`VITE_*`** public base URL may become unnecessary for attachments if all loads go through API/CDN

### (B) Web-client (UI) — upload via API only

- [x] **Tests first (`*.tsx`):** MSW **`POST /media/upload`** → progress callback → resolved **`MediaUploadResponse`**
- [x] **File picker + FormData:** **`file`** field per OpenAPI; **`uploadMedia`** (**`mediaApi.ts`**)
- [x] **Progress + cancel:** **`axios` `onUploadProgress`** or XHR; **`AbortController`** for cancel; retry UX
- [x] **Composer:** after upload, pass **`mediaKey`** / preview URL into **`sendMessage`** — **no** browser **S3** calls
- [x] **`useMediaUpload` hook:** percent + error state (**no** `aws-sdk` in **`package.json`**)
- [x] **Thread:** **`<img>`** from API/CDN URLs; **`loading="lazy"`**; **`alt`**; optional lightbox
- [x] **Env / CDN:** **`VITE_API_BASE_URL`** in **`README.md`** (Configuration section); public **bucket/CDN** base URL for **`src`** if different from API origin

---

## Feature 7 — Notifications (multiple types: calls, messages, etc.)

### (A) Infra, backend & deployment

- [x] **messaging-service — pipeline (aligned with 1:1 messaging):** **`notification`** is **not** emitted inline only from the HTTP/socket handler that persisted the message; it **follows RabbitMQ** using the **same topic exchange + per-replica queue + consumer** path as **`message:new`** for the **recipient** (routing key **`message.user.<recipientUserId>`**). Flow: **A sends** → persist → **publish** for **B** → a replica **consumes** → **`io.to('user:<B>')`** emits **`notification`** (+ **`message:new`**). **No** Redis Streams; **no** separate notification microservice (**`PROJECT_PLAN.md` §3.3**).
  - [x] **Message toasts (§8 `kind: "message"`):** implemented in **`rabbitmq.ts`** consumer alongside **`message:new`** (see **Project setup → Feature 7** nested bullets above).
  - [x] **Call `kind: call_incoming`:** when Feature 3 / call signaling publishes to the broker (routing **`message.call.user.<calleeUserId>`**), consumer → **`user:<calleeUserId>`** — **tracked with calls**
- [ ] **Web Push** (optional later): VAPID keys in env; subscription storage if product adds background push

### (B) Web-client, UI, tests & state management

- [x] **Worker:** parse **`notification`** event; **`postMessage`** discriminated payload to main (**`socketWorker`** / **`socketBridge`**)
- [x] **Main thread:** listener dispatches to Redux or shows toast — thin **`useNotifications`** hook
- [x] **Redux:** **`notifications`** slice (queue, read ids) — optional middleware later
- [x] **UI — toasts + audio:** map **`kind`** (`message` vs `call_incoming`, …); play **distinct alert sounds** per kind (message vs ring for calls); **tests first (`*.tsx`)**
- [x] **E2EE + message notifications:** **`kind: 'message'`** — **sound-only** (no toast; avoids ciphertext in preview); other kinds (**`call_incoming`**, …) — toast + sound; Redux queue unchanged (**`useNotifications`**)
- [x] **Call notifications:** **`kind: 'call_incoming'`** — **toast +** **`playInboundNotificationSound`**; ring pattern **louder / longer** than message chime (**`notificationAlertSounds.ts`**); **`useNotifications.test.tsx`** + **`notificationAlertSounds.test.tsx`**
- [ ] **UI — optional:** notification centre panel; **Web Push** permission only if (A) implements push

### Post-MVP — DND / mute (deprioritized, **not** MVP scope)

_Pick up only after core in-tab notifications and call flows are done; not part of the bounded MVP._

- [ ] **DND / mute (product TBD):** per-user or per-conversation suppression of **`notification`** toasts/sounds — server rules and/or client prefs API, quiet hours, **or** local-only — **design later**; does **not** block MVP (**see also** Definition of done callout above).

---

## Feature 3 — Video / audio call between two users (1:1)

### (A) Infra, backend & deployment

- [x] **Socket.IO** signaling: offer/answer/ICE; authz for peer pairs — **`webrtc:offer`**, **`webrtc:answer`**, **`webrtc:candidate`** (ack); relay to **`user:<peerUserId>`** with **`fromUserId`**; **Zod** payloads (**`webrtcSignalingSchemas.ts`**); **`assertWebRtcSignalingPeerAllowed`** (same rule as **`guestMessagingAuthz`**); Redis **`WEBRTC_SIGNAL_RATE_LIMIT_*`** (**`webrtcSignalRateLimit.ts`**, **`webrtcSocketHandlers.ts`**)
- [x] **STUN**; **TURN** (coturn in Compose or managed); nginx/WSS/TURN ports documented — **`infra/coturn`** + **`--profile turn`**; **`getWebRtcIceServers()`** + **`VITE_WEBRTC_*`**; **README.md** table (8080 / **`wss`** / **3478** / relay **49152–49200**); **`infra/.env.example`**
- [x] **Hangup / end-call signaling (1:1):** **`webrtc:hangup`** — relay **`callId`**, **`fromUserId`** to peer’s **`user:<peerUserId>`** room with same authz as offer/answer; rate-limit consistent with other signaling; **OpenAPI** description updated (**`docs/openapi/openapi.yaml`**)
- [ ] Optional: emit **Socket.IO** notification events for call state (Feature 7) — same connection as signaling

### (B) Web-client, UI, tests & state management

- [x] **Tests first**, then UI: call controls (answer/reject/mute/video/hangup) — **`CallControls.test.tsx`** + **`CallControls`** (**answer** / **decline**, **cancel call** outbound, **mute** / **camera** / **hang up** active, **`aria-pressed`**, disabled); **`CallSessionDock`**
- [x] **Redux** or dedicated hook state for call session (idle / ringing / active / error) — **`callSlice`** (**`startOutgoingCall`**, **`incomingCallRinging`**, **`answerCall`**, **`rejectCall`**, **`hangupCall`**, **`toggleCallMic`**, **`toggleCallVideo`**)
- [x] WebRTC peer connection lifecycle in hooks; device permissions UX — **`useWebRtcCallSession`** (**offer/answer/ICE**, **`getWebRtcIceServers`**, track mute); **Socket worker** **`webrtc:*`** emit + inbound; **`describeMediaAccessError`** + **`call.errorMessage`** in **`CallSessionDock`**
- [x] Layout for local/remote video; a11y for controls — **`CallVideoStage`** (remote + PiP local, placeholders); **`CallSessionDock`** (**`aria-live`** status, **`sr-only`** remote audio fallback); **`CallControls`** **`role="toolbar"`**, **`aria-label`** / **`aria-pressed`**
- [x] **Full-screen 1:1 call UI:** **`CallSessionDock`** — **`data-call-chrome="fullscreen"`** (`fixed inset-0`, safe areas); **Minimize** → **`minimized`** floating card (`sm:right-4`, `max-w`, scroll-safe); **Expand** restores; **`CallVideoStage`** **`layout="compact"`** in minimized bar — **`CallSessionDock.test.tsx`**
- [x] **Remote hangup = local end:** on inbound **`webrtc:hangup`** (matching **`callId`** / **`peerUserId`**), **`dispatch(hangupCall())`** — existing idle cleanup tears down **`RTCPeerConnection`** and tracks
- [x] **Local hangup notifies peer:** **`requestLocalEndCall`** → **`emitWebRtcSignaling('webrtc:hangup', …)`** then end session (**`CallSessionDock`**, thread-switch / group guards)

---

## Feature 6 — Last seen per user

**Distinction from Feature 12:** **Last seen** is **user presence** (last app activity). **Message “seen” / read receipts** are **per-message** state — **independent** pipelines; see **`docs/PROJECT_PLAN.md` §14**.

**Algorithm (locked):** While Socket.IO is connected, the **client** sends **`presence:heartbeat` every 5 seconds**; **messaging-service** stores the timestamp in **Redis** (`presence:lastSeen:{userId}`, TTL **`LAST_SEEN_TTL_SECONDS`**). When the **Socket.IO connection closes**, the service **writes that last-seen time to MongoDB** (`users.lastSeenAt` for `users.id === userId`) and **removes** the Redis key. _No_ Redis update on connect alone—only heartbeats.

### (A) Infra, backend & deployment

- [x] **Redis (hot / online):** accept **`presence:heartbeat`**; update Redis at most once per **~4.5s** per socket (throttle); **`src/presence/lastSeen.ts`**
- [x] **MongoDB (durable / offline):** on **disconnect**, **`flushLastSeenToMongo`** — copy Redis timestamp → **`users.lastSeenAt`**, then **`DEL`** Redis key; **`src/presence/flushLastSeenToMongo.ts`**
- [x] **Read path (WebSocket):** client emits **`presence:getLastSeen`** with **`{ targetUserId }`** and uses the **ack** callback — server: **Redis first**, then **`users.lastSeenAt`** in MongoDB, else **`{ status: 'not_available' }`** (`resolveLastSeenForUser`)
- _Deprioritized — not required for now:_ **Authz on `targetUserId`** for **`presence:getLastSeen`** (optional **REST** mirror in **OpenAPI**) — revisit with **Feature 2** when privacy policy needs it.
- [ ] Future “invisible” / presence privacy if scoped (separate from notification delivery)

### (B) Web-client, UI, tests & state management

- [x] **Worker — heartbeat:** **`setInterval(5000)`** → **`socket.emit('presence:heartbeat')`** while connected; clear on **`disconnect`** (**`socketWorker.ts`**)
- [x] **Worker / bridge — getLastSeen:** emit **`presence:getLastSeen`** + **`targetUserId`**; forward **ack** to main via **`socketBridge`**
- [x] **Main thread:** hook **`useLastSeen(targetUserId)`** (or similar) — parse **`ok`** / **`not_available`** / **`error`**
- [x] **UI — display:** relative time in header / contact row; “online” vs stale (product rules)
- [x] **Tests first (`*.tsx`):** presentational row/header with mocked **`lastSeenAt`**
- [x] **State:** **`presenceByUserId`** in Redux or context; selectors for “online” heuristic

---

## Cross-cutting — Infrastructure and hardening

### (A) Infra, backend & deployment

- [ ] Metrics + health for **messaging-service**; structured logs; optional OpenTelemetry
- [ ] Rate limits (see **Cross-cutting — Global rate limiting** for **500/min** per-IP app-level plan), audit logs, secrets management, backups, load tests, runbooks

### (B) Web-client, UI, tests & state management

- [ ] Global error boundary + user-friendly API error mapping (Redux middleware or hook)
- [ ] Optional: client-side analytics hooks; performance budgets for bundle size

---

## Feature 8 — Group messaging

**Post-MVP / not in bounded MVP scope** — tracking only.

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

## Feature 10 — Contact list (add users)

**Post-MVP / not in bounded MVP scope** — tracking only.

### (A) Infra, backend & deployment

- [ ] Contacts collection: owner, contact user, status (pending/accepted/blocked)
- [ ] Send/accept/decline/list APIs; authz
- [ ] Update **OpenAPI**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: contact list, incoming requests, add-by-email/search integration
- [ ] **Redux** slice for contacts + request states; hooks `useContacts`, `useContactRequest`
- [ ] Empty/loading states; navigate to chat from contact

---

## Feature 4 — Group call

**Post-MVP / not in bounded MVP scope** — tracking only (**1:1** calls are **Feature 3**).

### (A) Infra, backend & deployment

- [ ] Document decision: mesh vs **SFU/MCU**; containerize SFU in Compose if used
- [ ] **Socket.IO** group signaling: join/leave, participant roster
- [ ] Optional: **Socket.IO** notification event types for group call events (Feature 7)

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: group call join/leave, participant grid/list, dominant speaker optional
- [ ] **State**: participant map, connection quality stubs if needed; Redux or hooks per complexity
- [ ] Reuse or extend 1:1 WebRTC patterns; clear error when SFU unavailable

---

## Feature 9 — Create groups

**Post-MVP / not in bounded MVP scope** — tracking only.

### (A) Infra, backend & deployment

- [ ] Create/update/archive group APIs; authz for admins/creators
- [ ] On membership add/remove, **Socket.IO** join/leave **group id** rooms for affected users (`PROJECT_PLAN.md` §3.2.1)
- [ ] Update **OpenAPI**

### (B) Web-client, UI, tests & state management

- [ ] **Tests first**, then UI: create-group flow (name, members picker), edit group optional
- [ ] **Redux**: create group thunk → refresh groups list; optimistic UI optional
- [ ] Validation and error feedback from API

---

## Shipped (no remaining checkboxes under these headings)

## Cross-cutting — Global rate limiting (messaging-service)

**Goal:** move from **route-only** Redis limits to a **global per-IP** cap on API traffic, with a **default target of 500 calls per minute** per client IP (exact window/max expressed via env — e.g. **60 s** window, **500** max requests, or equivalent).

### (A) Infra, backend & deployment

- [x] **Global per-IP rate limit — 500 calls / minute (configurable)**
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

## Feature 2a — Guest / try-the-platform (temporary access)

**Goal (demo / playground):** Visitors get **temporary access** without **Feature 2** full registration (email, password, verification). They explore the product in a **sandboxed guest mode**.

**Caveats (locked — supersede any “message anyone” wording):**

- **Guest ↔ guest messaging only:** Guests **cannot** message **registered** users. Guests may **only** message **other guests** (same `isGuest`/guest identity rules). Do **not** allow guest → registered DMs, conversation creation with a registered **recipientUserId**, or **search / user directory** that surfaces registered users. **Search directory:** when the caller is a guest, **`GET /users/search`** (or the home **user search** path) must return **only other guests** so they can **start a conversation** with peers in the guest sandbox — never registered accounts in results.
- **Username before session:** Full registration is **not** required, but the visitor **must** provide a **username** (validated; uniqueness policy TBD — e.g. among guests or global) **before** the guest session is issued. Optional **display name** may be collected in addition if product wants both.
- **Guest entry vs register (web-client):** Guest login is **only** a **single primary button** (e.g. **Try the app** / **Continue as guest**) leading to a **small dedicated page** that collects **username** (and optional **`displayName`** if we add it) and calls **`POST /auth/guest`**. **Do not** add guest fields, combined flows, or guest submission to **`RegisterPage`**. **Full registration** (**Feature 2**) keeps **`email` mandatory** on the register form and existing register validation — guest and register remain **separate routes**.

**Product rules (locked):** **`README.md`** / **`docs/PROJECT_PLAN.md`** — **30 min** session + refresh, rate limits, **guest-only** messaging graph (above), **no settings** / admin / password / billing for guests. **Guest access** **on/off** via **`guestSessionsEnabled`** in **MongoDB** (see **Cross-cutting — Runtime configuration (MongoDB)**), not env-only. Open items (e.g. groups / calls) remain in checklist.

### (A) Infra, backend & deployment

- [x] **Product rules:** Document guest **TTL**, **rate limits**, and **who guests can message** (and what is blocked: e.g. admin, password change, billing) — \***\*`README.md`** / **`docs/PROJECT_PLAN.md`** (guest rules)\*\*
- [x] **Product rules — align docs:** Update **`README.md`** / **`docs/PROJECT_PLAN.md`** guest sections so they state **guest ↔ guest only**, **username required** before **`POST /auth/guest`**, **guest-only search directory** (guests find **only** other guests to start a thread), and **no** guest → registered messaging (replace any “search + DM registered users” language).
  - **Done:** **`README.md`** — **Configuration** → **Guest sessions (Feature 2a)**; **`docs/PROJECT_PLAN.md`** — **§7** subsection **Guest sessions (temporary access — Feature 2a)** (before **§7.1** E2EE).
- [x] **Guest enable/disable (DB):** enforce **`guestSessionsEnabled`** from **MongoDB** runtime config — reject **`POST /auth/guest`** when disabled — **Cross-cutting — Runtime configuration (MongoDB)**
- [x] **Session + refresh TTL (30 minutes):** **access token** lifetime **30 minutes**; issue a **refresh token** for guests with **30 minutes** validity (Redis TTL / stored expiry aligned); document in OpenAPI + **`docs/PROJECT_PLAN.md`** and **`README.md`** + **`README.md`** (Configuration section) when vars exist
- [x] **OpenAPI + Zod:** e.g. **`POST /v1/auth/guest`** — body **`{ username, ... }`** (**`username`** required — aligns with caveat); optional **`displayName`** if distinct from username; response **`accessToken`**, **`refreshToken`**, **`user`** (or public profile), **`expiresAt`**; **`guest: true`** (or equivalent) in **`User`** / token claims — bump spec + **`generate:api`** in same PR as routes.
- [x] **Persistence:** Guest identity — either rows in **`users`** with **`isGuest: true`** + nullable **`email`**, or a dedicated **`guest_sessions`** / **`users`** slice; store **`username`** (and optional **`displayName`**); indexes + optional **MongoDB TTL** on session documents.
- [x] **JWT:** Access + refresh for guests (**30 min** each, per above) with **`guest`** claim; align with **Feature 2** token shape so one **auth middleware** can branch **guest vs full user**; **`POST /auth/refresh`** for guest refresh tokens within validity window — **`signAccessToken`** / **`issueAuthTokens`**, **`postRefresh`** re-issues with guest TTLs when **`user.isGuest`**; **`verifyAccessTokenJwt`** + **`resolveBearerAuth`** / **`requireAuthenticatedUser`** + **Socket.IO** enforce **`guest`** claim vs **`users.isGuest`**
- [x] **Rate limits:** Per **IP** (and optionally per **fingerprint** header) on **`POST /auth/guest`**; abuse caps on sends for guest **`userId`** — **`GUEST_AUTH_RATE_LIMIT_*`**, optional **`X-Client-Fingerprint`** (**`guestAuthRateLimit.ts`**); **`GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER`** in **`messageSendRateLimit.ts`** (Socket + deprecated **`POST /messages`**)
- [x] **AuthZ — guest ↔ guest only:** On **REST** and **Socket.IO** (**`message:send`** — **Send path — Socket.IO (target)**, **`sendMessageForUser`**, conversation **lazy-create**): reject when **sender** is guest and **recipient** is **not** a guest (registered user); reject when **recipient** is guest and **sender** is registered if product forbids that direction too — **default:** only **guest → guest** threads; block guest from addressing **`recipientUserId`** / **`userId`** of registered accounts — **`assertGuestGuestDirectMessagingAllowed`** in **`guestMessagingAuthz.ts`** (**403** **`GUEST_MESSAGING_FORBIDDEN`**)
- [x] **Search directory — guests see guests only:** When **`requireAuthenticatedUser`** identifies a **guest** (`isGuest` / JWT claim), **`GET /v1/users/search`** (and any **user directory** used to pick someone to DM) **filters results to `isGuest: true`** only (or equivalent) — registered users **never** appear; document query param / behaviour in **OpenAPI** + **`README.md`**; rate limits unchanged or stricter for guests as needed — **`searchUsersForCaller`** / **`findUsersBySearchSubstringMatch`**, **`GUEST_USER_SEARCH_RATE_LIMIT_*`**
- [x] **AuthZ — privilege ceiling:** Guests cannot escalate to full-account actions (**register** is separate flow); block **settings**, admin, password, billing as already planned — **`rejectGuestUserMiddleware`** on **`PATCH /v1/users/me`**; **`POST /auth/reset-password`** / **`POST /auth/verify-email`** reject **`isGuest`** (**403** **`GUEST_ACTION_FORBIDDEN`**); no admin/billing routes in service
- [x] **Lifecycle:** Clear behaviour on expiry (401 + client redirect to **username** / guest entry screen); optional **“Continue as guest”** re-issue with same **username** policy (collision handling: suffix, uniqueness window).

### (B) Web-client, UI, tests & state management

- [x] **Entry UX (dedicated guest page — does not touch `RegisterPage`):**
  - [x] **CTA:** One **primary button** on **landing** and/or **login** (not on register) → route to the guest page.
  - [x] **Guest page (small):** **username** required; optional **`displayName`** only if product adds it; client validation (length, charset, profanity optional) → **`POST /auth/guest`** → **`applyAuthResponse`** / token + user in **`auth`** slice.
  - [x] **Register screen unchanged:** **no** guest mode on **`RegisterPage`**; **email** stays **mandatory** for **`POST /auth/register`** (see **Feature 2 (B)** — register vs guest).
- [x] **Discoverability:** Guest entry is the **button + dedicated page** above — **beside** sign-up / login links, not merged into register; no email verification for guests.
- [x] **Session UI:** Persistent **banner** — _You’re using a temporary guest session_ — link to **Create account**; show **time remaining** if API exposes **`expiresAt`**; copy that **only other guests** can be messaged unless user **registers**.
- [x] **Routing / UX guardrails:** Guest **protected routes** only where allowed; **block** or **hide** settings that require a real account; **do not** expose registered-user search or “message user” flows that target registered accounts — empty state or upsell to **register** if a user tries.
- [x] **Search / directory UI (guest):** **`UserSearchPanel`** (or guest-only variant) uses the **guest-scoped search** response — directory lists **only other guests** for starting a conversation; loading / empty / error copy reflects **guest sandbox** (e.g. no registered users, encourage **register** to reach full directory); **tests first (`*.tsx`)** per **`docs/PROJECT_PLAN.md` §14** §4.1.1.
- [x] **Tests first**, then UI: happy path (**username** → session), expired token, **guest cannot message registered user** (API error / UI), **search directory returns only guests** (MSW / integration), Redux **guest** vs **registered** state.

---

## Feature 5 — Search users by email

### (A) Infra, backend & deployment

- [x] **Search input is email** (not internal user id): **`GET /v1/users/search?email=`** — returns **`UserSearchResult`** ( **`displayName`**, **`profilePicture`**, **`userId`**, **`conversationId`** nullable)
- [x] **MongoDB + limits:** unique index on **`email`** (exact lookup — **`users_email_unique`**); **Redis** per-IP rate limits on search (**`USER_SEARCH_RATE_LIMIT_*`**)
- [x] **Privacy (MVP):** **exact match** only — **no** prefix/typeahead (enumeration risk); extended discoverability rules TBD
- [x] **OpenAPI** — **`/users/search`** + **`UserSearchResult`** + **`429`**; **`README.md`** (Configuration section) — **User search policy**

### (B) Web-client, UI, tests & state management

- [x] **Tests first (`*.tsx`):** **`UserSearchPanel.test.tsx`** (standalone card); **`HomeConversationShell.test.tsx`** / **`HomePage.test.tsx`** — debounced **`searchUsers`**; empty state; shell **no** **`<dialog>`**; **`setActiveConversationId`** when result has **`conversationId`**
- [x] **Search field:** **`useUserSearchQuery`** (**`useDebouncedValue`** + **`useSWR`** + **`searchUsers`**); **`HomeConversationShell`** composes **`UserSearchBar`** (**Find someone** / **Find other guests**) at the **top of the left (list) column**; standalone **`UserSearchPanel`** is a bordered card for tests / other embeds
- [x] **Results in shell:** **`UserSearchResultsPane`** replaces **`ConversationList`** in the list column while a valid query is active; new DM from search uses **`setPendingDirectPeer`** + thread **`NewDirectThreadComposer`** (not inline in the list column)
- [x] **Result → conversation:** **`handleUserSearchSelection`** → **`setActiveConversationId`** or **`setPendingDirectPeer`**; search query resets after navigation (**`useDebouncedValue`** flushes immediately when cleared)
- [x] **Results list:** **`UserSearchResultList`** — name, avatar, hint; arrow keys (**existing**)
- [x] **State:** **`useUserSearchQuery`** (**`useState`** query + **`useSWR`**)
- [x] **a11y:** **`aria-labelledby`** on **`UserSearchBar`** / standalone panel; list **`role="list"`** / row **buttons**

---

_Checklist version: 8.3 — Adds **Backlog — Conversation ordering, guest labels, Cloudflare media, presence, scroll, client env** (§1–§8: list sort, guest header, R2 pre-signed + E2EE media URL, last-seen live + placement, auto-scroll, avatar upload, client env/gitignore). **document order:** unchanged (E2EE sections first, then MVP outstanding, Post-MVP, Shipped)._
