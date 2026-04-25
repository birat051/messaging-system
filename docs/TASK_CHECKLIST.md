# Ekko — Task Checklist

Use this to track **remaining** work. **Implementation detail** for completed items lives in the codebase and [PROJECT_PLAN.md](./PROJECT_PLAN.md). E2EE / device sections sit up front for visibility; other sections follow roughly by product area.

**Pattern (when applicable):** (A) **messaging-service / infra** — (B) **web-client** (Redux, hooks, `*.tsx` tests per §14).

---

## Prerequisite — User keypair (device-scoped) & product direction (E2EE UX)

> **Done:** Per-device P-256 + IndexedDB + `POST /v1/users/me/devices`; `cryptoSlice`; no Settings “encryption” UI; `useRegisterDevice` / `logoutDeviceRevocation` / `VITE_REVOKE_DEVICE_ON_LOGOUT`. Hybrid send path integrated with Feature 1 / 11.

**Remaining**

- [ ] **Routes + Zod:** device key handlers (replacing any legacy user-level paths); Zod for register body + response; **authz** on `GET /users/:userId/devices/public-keys` (participants only)
- [ ] **Operational:** document device revocation (`DELETE` on logout); lost-device recovery via **Feature 13**; **README** + **PROJECT_PLAN** §7.1

---

## Feature 11 — Message encryption (hybrid; 1:1 shipped, group post-MVP)

> **Done (MVP 1:1):** `common/crypto` hybrid pipeline; per-device `encryptedMessageKeys`; send/receive/dedupe; legacy E2EE removal inventory complete. **Post-MVP:** full threat-model bullets, group wrap, “operational” doc line below.

**Remaining**

- [ ] **Group messaging (A):** one AES body, wrap for every device of every member; join/leave strategy doc
- [ ] **Operational (A):** revocation flow; recovery via **Feature 13**; no Settings key UI
- [ ] **Group flow (B):** same wrapping as 1:1 for all members’ devices
- [ ] **Verification:** hybrid-only 1:1 smoke; no `E2EE_JSON_V1` in source; OpenAPI matches implementation

---

## Bugfix — Sign out / relogin (same browser): decrypt failures

> **Done:** Repro + network + bootstrap traces documented in **PROJECT_PLAN** §7.1; `logoutReloginHybridDecrypt.integration.test.ts`; server `registerOrUpdateDevice` + IDB policy aligned.

- [ ] **Manual QA:** signup → E2EE → sign out → login → read history + send
- [ ] **Closed-loop:** link PR; note `VITE_REVOKE_DEVICE_ON_LOGOUT` / storage ops follow-up

---

## Bugfix — Second browser (Feature 13 sync)

> **Done:** Traces, server verification, policy + `secondBrowserSync.integration.test.ts`; **PROJECT_PLAN** §7.1 / Feature 13 alignment.

- [ ] **Manual QA:** A online → B login → A approves → B historical decrypt
- [ ] **Manual QA (negative):** B logs in while A offline — expected behavior vs bugs

---

## Bugfix — User A → B → A (Socket.IO reconnect storm)

> **Done:** `lastWorkerAccessTokenRef`, debounce, `authSessionEquivalent`, `SocketWorkerProvider` tests; debug `console.log` removed from hot paths; **PROJECT_PLAN** references for token/socket ordering.

- [ ] **Manual QA:** full A → B → A matrix; send after A relogin — no reconnect storm

---

## Bugfix — Sender multi-device hybrid (missing `encryptedMessageKeys` on second browser)

> **Done:** `mergeHybridDeviceRows` + `me` directory; `invalidateDevicePublicKeys` on `device_sync_*`; `useSendEncryptedMessage` / server public-keys tests.

- [ ] **Optional UX:** `message:new` / refetch path recovery if device row appears after send
- [ ] **Manual QA:** A₁ + A₂ + B — sent bubble ok on both A browsers; B ok

---

## Feature 13 — Multi-device key sync

> **Done:** APIs (`/me/devices`, sync message-keys GET/POST, `device:sync_*`); `NewDeviceSyncBanner` / `DeviceSyncApprovalBanner` / `useDeviceKeySync` / `cryptoSlice` sync state; rate limits; unit + integration coverage.

---

## Definition of done (MVP smoke)

- [x] **`docker compose`** brings up **messaging-service** + deps per **`README.md`**
- [x] **nginx** serves **web-client** **`dist/`** + proxies API (or documented equivalent)
- [ ] **TLS** documented for production (even if local dev stays HTTP)
- [ ] **OpenAPI** in repo; **`npm run generate:api`** in **web-client**; **Swagger** at **`/api-docs`**
- [ ] **Redux** + typed hooks per **`docs/PROJECT_PLAN.md` §14**
- [ ] **Smoke — auth:** register → login ( **`EMAIL_VERIFICATION_REQUIRED=false`** default; separate smoke if **`true`** )
- [ ] **Smoke — messaging:** 1:1 thread send/receive (**group** messaging is **post-MVP** — see scope note under **Definition of done**)
- [ ] **Smoke — media:** **presign** → client **PUT** to R2 (or compatible) → attach **`mediaKey`** in thread (no **`POST /v1/media/upload`** from browser for chat attachments)
- [ ] **Smoke — notifications:** in-tab **`notification`** for a message after broker fan-out (topic **`message.user.<recipient>`** → consumer → **`user:<recipient>`** Socket.IO room) — or stub if not wired end-to-end
- [ ] **Smoke — call:** 1:1 call happy path (or documented skip)
- [ ] **Feature 2a (optional):** guest path — **button → small dedicated guest page** (**username**); **guest ↔ guest** messaging only; **not** merged with **register** (see **Feature 2a** caveats)
- [ ] **Socket.IO** status visible (**connecting** / **connected** / **disconnected**)
- [ ] _(If E2EE in scope)_ **Prerequisite — User keypair** (per-device key pair + device registration) + **Feature 11** per-device hybrid send/receive (AES-256-GCM + `encryptedMessageKeys` map) + **Feature 1 (B)** E2EE indicator in chat; **Feature 13** multi-device sync covers new-device key re-sharing — not required for single-device MVP but must not be broken by Feature 11 work
- [ ] _(If receipts in scope)_ **Feature 12** **sent** / **delivered** / **seen** end-to-end

> **Out of MVP scope (deprioritized):** per-user **DND** / notification **mute** / quiet hours — not scheduled for the bounded MVP; see **Feature 7 — Post-MVP (DND)** below.

> **Post-MVP / not in bounded MVP:** **Feature 4** (group call), **Feature 8** (group messaging), **Feature 9** (create groups), **Feature 10** (contact list), and the **full Feature 11** spec (threat model, group keys, APIs beyond **1:1** shipped today) — they stay in this checklist for **future** work and **do not** gate MVP delivery.

## MVP — Privacy policy & terms of service

> **Done:** `/privacy`, `/terms`, auth footers + Settings links, public routes, tests.

## Manual full-system test checkpoints

Run after major merges, before demos, or when debugging the stack. (Automate later if useful.)

- [ ] **Compose bring-up:** `docker compose -f infra/dev/docker-compose.yml up -d --build` — `docker compose ps` shows expected containers; **`README.md`** host/port match your test.
- [ ] **HTTP health:** **`GET /v1/health`** and **`GET /v1/ready`** via nginx (e.g. **`http://localhost:8080`**) — **200** when dependencies are up; **`/v1/ready`** reflects MongoDB, Redis, RabbitMQ, S3 as configured.
- [ ] **Swagger:** **`/api-docs`** loads; spot-check a **public** route, then **Authorize** with a Bearer token and hit a protected route.
- [ ] **Web client:** `npm run dev` in **`apps/web-client`** _or_ static **`dist/`** behind nginx — app shell loads; **Network** shows API calls to **`VITE_API_BASE_URL`** / proxy.
- [ ] **Auth path:** register + login **or** login only — session survives refresh; **logout** clears client storage; optional: **`EMAIL_VERIFICATION_REQUIRED=true`** in [`apps/messaging-service/.env.example`](../apps/messaging-service/.env.example) / `loadEnv()`.
- [ ] **Socket.IO:** client **connected**; no repeated **401** loops; **presence:heartbeat** only if **Feature 6** path is enabled.
- [ ] **Quality gates:** `npm run lint` + `npm run typecheck` in **`apps/web-client`** and **`apps/messaging-service`** (and **`npm run test`** where UI **`*.tsx`** tests exist).

When **Feature 1** messaging and later features land, also run the **Definition of done (MVP smoke)** checklist end-to-end.

## Product polish & Ekko UX backlog (search, E2EE display, calls, theme, media, titling, guest→register, rename)

> **Done:** Search in shell (no modal), WhatsApp-style columns; E2EE trace + display pipeline; `RemoteCallEndedToast` + call end reasons; theme toggle; attachment preview + `mediaPreviewUrl` merge; thread titling; guest register route fix; Ekko branding; **README** / plan references updated.

## Backlog — Conversation order, guest labels, R2 presign, presence, scroll (§6), profile, env

> **Done:** `bumpConversationInListCache` + SWR; guest header labels + `GET /users/:id`; R2 presign-only composer, hybrid media inner JSON, `useMediaUpload` tests; last-seen in thread only + live `getLastSeen` polling; `senderPlaintext` IDB + listener; receipt emit guards; composer send icon + attach; user search copy trim; empty thread placeholder; `ConversationListRow` layout; `ConnectionStatusIndicator` in header; header tech line removed. **R2/§3, §4, §5, §6.1, §6.3–6.4, §7–8** implemented per prior checklist — see `ThreadMessageList`, `conversationScrollOnMessageNewListener`, `messagingSlice`.

**Remaining (scroll §6)**

- [ ] **Do not set** `setConversationScrollTarget` when the user is **intentionally scrolled up** (or only auto-scroll when near bottom) — align with §6 “new messages below” banner if any
- [ ] **Regression:** User **scrolled up** — no forced scroll if product chose gate above (assert **`scrollIntoView`** not called)

---

## Project setup

> **Done:** Monorepo per app (**no** root ESLint/Prettier for whole repo). **messaging-service:** Express, TS, MongoDB, Redis, RabbitMQ, Socket.IO, S3, presence pipeline, 1:1 `message:new` + notifications via RMQ, global rate limit, OpenAPI + Zod, integration tests. **web-client:** Vite, React, Tailwind, RTK, SWR, Axios + 401 refresh, socket worker, MSW + `renderWithProviders`, `common/` + `modules/` layout, path aliases, RTL tests. **nginx** SPA + proxy in Compose. **Home & messaging** planned fixes (full width, shell, E2EE bootstrap, demo copy removal, search similarity, register username, viewport, long messages, historical E2EE bugs, `message:new` fix, `senderPlaintext`, directory migration) — shipped.

- [ ] **Docker Compose, nginx, TLS, deployment**
  - [x] **`docker compose`**: **`infra/dev/docker-compose.yml`** — messaging-service, MongoDB, Redis, RabbitMQ, MinIO, **nginx** (e.g. `http://localhost:8080`); optional **coturn** profile
  - [x] **nginx** — reverse-proxy REST + **Socket.IO**; serve **`web-client` `dist/`** (SPA fallback); **README** + **infra/dev/.env.example**
  - [ ] **TLS (prod split / k6 only):** for the **prod** split stack (this checklist § **PC-4**), **nginx** → **Certbot (webroot)** → **nginx reload** — **do not** add this to **`README.md`**
  - [ ] **Production WebRTC** — TURN creds rotation, firewall (beyond dev **coturn** profile)

- [ ] **web-client — REST mocking and integration tests** (**`docs/PROJECT_PLAN.md` §14** §4.1) — _baseline harness shipped (MSW, `renderWithProviders`, `viteEnvSecurityPolicy`); still tracked as a bucket for stricter policy_

- [ ] **web-client — Axios, SWR, global HTTP** (depends on **Redux** + **`react-router`**) — _interceptor + SWR + API modules **done**; tests below open_

- [ ] **Tests (`*.tsx` only, §4.1.1)** — split by scenario (each can be one PR):
  - [ ] **401 → refresh → retry success:** MSW or mock **`httpClient`** — first **GET** **401**, **`POST /auth/refresh`** **200**, retried **GET** **200**
  - [ ] **401 → refresh fails → login redirect:** refresh **401** → assert **`navigateToLogin`** / logout (mock **`navigation`**)
  - [ ] **Optional:** component using **`useSWR`(`API_PATHS.users.me`)** + MSW happy path (smoke)

_(Connection status UI, Redux shell, and most skeleton bullets are **done** — see `httpClient`, `swrConfig`, `ConnectionStatusIndicator`.)_

## Prod split stack (ekko) + k6 — split Docker Compose (data vs app) + nginx TLS (Certbot)

> **Scope:** This **PC-1..PC-5** layout (two compose files, **`ekko.biratbhattacharjee.com`**, **`mongo.biratbhattacharjee.com`**, MinIO on the data host, **nginx** → **Certbot** → reload) is **only** for **k6 / scalability load testing** (e.g. **CX22**). It is **not** the project’s long-lived “production” story. **Do not** add a **split-compose / deploy** section to the main [**`README.md`**](../README.md) for this; keep **README** centered on local **`infra/dev/docker-compose.yml`** and general configuration. Use **this checklist** and [`docs/prod-runbook.md`](../docs/prod-runbook.md) (condensed) plus [`infra/prod/nginx/README.md`](../infra/prod/nginx/README.md) for the **prod** environment — **not** the main **README**.

**Context:** [`infra/dev/docker-compose.yml`](../infra/dev/docker-compose.yml) is the **day-to-day** single-host stack. For **load tests** on two hosts (or two compose projects on one box), add **two** derived compose files: **data** = Mongo + Redis + **MinIO (same machine as Mongo)** + coturn; **app** = RabbitMQ + nginx + **messaging-service** (S3 to MinIO on the data host).

**Prod DNS (this deploy):** **`ekko.biratbhattacharjee.com`** — SPA + APIs (same host via **nginx** + **`messaging-service`**). **MongoDB** (data / PC-1) — **`mongo.biratbhattacharjee.com`**. **MinIO** on the data host, app host only. **SSL:** you point **`ekko.biratbhattacharjee.com`** at the app host; **PC-4** — **Certbot** after **nginx** (webroot), then **reload nginx**. Redis, RabbitMQ, and TURN: same data host or private DNS — document in the **prod** notes (not **README**).

### PC-1 — Data-plane compose: MongoDB, Redis, MinIO, coturn (TURN)

- [x] **New file:** add `infra/prod/docker-compose.data.yml` containing **`mongo`**, **`redis`**, **`minio`**, and **`coturn`** (no `profiles: [turn]` on **coturn** — always on).
- [ ] **DNS — Mongo:** point **`mongo.biratbhattacharjee.com`** to the **data** host; use this FQDN in docs and in **`MONGODB_URI` examples** (e.g. `mongodb://user:pass@mongo.biratbhattacharjee.com:27017/ekko` — match real auth/DB name in secrets).
- [x] **MinIO on the data host (same machine as Mongo):** implemented in [`infra/prod/docker-compose.data.yml`](../infra/prod/docker-compose.data.yml) (same **image** / **`minio-data`** as monolith; **console** `--console-address` **127.0.0.1:9001**; publish **9001** as **`127.0.0.1:9001:9001`**; **S3** **9000** with compose comments to firewall, not public). **S3 / env alignment** and **smoke** one-liners: [`infra/prod/.env.data.example`](../infra/prod/.env.data.example). On the app host, set **`S3_ENDPOINT`** to `http://<data-hostname-or-IP>:9000` and **`AWS_ACCESS_KEY_ID`** / **`AWS_SECRET_ACCESS_KEY`** to the same values as **`MINIO_ROOT_*`** on the data host. Presign/health from app when app compose exists.
- [ ] **Networking & exposure:** decide bind addresses: Mongo/Redis/MinIO should **not** be world-exposed; restrict so only the **app** host (serving **`ekko.biratbhattacharjee.com`**) can reach `mongo.biratbhattacharjee.com:27017` (and Redis) and **MinIO :9000** via firewall / private routing / Docker. Document ports: `27017`, `6379`, `9000` (S3 API, app → data only), `9001` (console, local/VPN if enabled), TURN `3478` tcp+udp, relay `49152-49200/udp` (per [`README`](../README.md) / coturn config).
- [x] **Persistence:** [`infra/prod/docker-compose.data.yml`](../infra/prod/docker-compose.data.yml) names **`mongo-data`** / **`minio-data`**; header + [`infra/prod/backup-restore.data.md`](../infra/prod/backup-restore.data.md) for backup/restore; **Redis** noted as ephemeral (no volume). **Healthchecks:** **mongo** / **redis** (redis + **`start_period`**); **minio** + **`curl` `/minio/health/live`**. **coturn** unchanged.
- [x] **coturn prod config:** [`infra/prod/coturn/turnserver.prod.template`](../infra/prod/coturn/turnserver.prod.template) + [`docker-entrypoint-coturn-prod.sh`](../infra/prod/coturn/docker-entrypoint-coturn-prod.sh) ( **`COTURN_REALM`**, **`COTURN_EXTERNAL_IP`**, **`COTURN_LT_USER`** / **`COTURN_LT_PASS`** from env) wired in [`infra/prod/docker-compose.data.yml`](../infra/prod/docker-compose.data.yml). **`getWebRtcIceServers()`** JSDoc + [`infra/prod/.env.data.example`](../infra/prod/.env.data.example) — **`VITE_WEBRTC_TURN_URLS`** = public TURN host; **`VITE_WEBRTC_TURN_USERNAME`** / **`VITE_WEBRTC_TURN_CREDENTIAL`** match **`COTURN_LT_`** env vars.
- [ ] **Deliverable:** `docker compose -f infra/prod/docker-compose.data.yml up -d` works; `mongosh` against **`mongo.biratbhattacharjee.com`**, `redis-cli PING` / TURN from the **app** host (serving **ekko**), and **MinIO S3 (9000)** reachable from the app host per the MinIO subtask, all succeed over the chosen network path.
- **Depends on:** host sizing, firewall, DNS (Mongo **`mongo.biratbhattacharjee.com`**, app **`ekko.biratbhattacharjee.com`**, TURN if using a public hostname, optional MinIO hostname on the data host).

### PC-2 — App-plane compose: RabbitMQ, nginx, messaging-service + remote S3 (MinIO on PC-1)

- [x] **New file:** [`infra/prod/docker-compose.app.yml`](../infra/prod/docker-compose.app.yml) — **`rabbitmq`**, **`messaging-service`**, **`nginx`**; **`depends_on`** only **rabbitmq** → **messaging-service** → **nginx** (no local MinIO/Mongo/Redis; **`S3_*` / `MONGODB_URI` / `REDIS_URL`** to PC-1 / env). Hints: [`infra/prod/.env.app.example`](../infra/prod/.env.app.example).
- [ ] **Remote URLs:** set **`MONGODB_URI`**, **`REDIS_URL`**, **`RABBITMQ_URL`** to reach **PC-1** services. At minimum document **`MONGODB_URI`** using **`mongo.biratbhattacharjee.com:27017`**; Redis/RabbitMQ may be same host, private hostnames, or `extra_hosts` — document the chosen model.
- [x] **S3 (MinIO on data host):** [`infra/prod/docker-compose.app.yml`](../infra/prod/docker-compose.app.yml) documents **S3\_\*** / **`AWS_*`** / default **`PUBLIC_APP_BASE_URL`** (**`ekko`**); [`infra/prod/.env.app.example`](../infra/prod/.env.app.example) + [`docs/prod-s3-and-r2.md`](../docs/prod-s3-and-r2.md) (R2/S3 **not** in **README**). **VITE*S3*\*** / presign alignment in **`.env.app.example`** (build section).
- [x] **Build & static assets:** [`infra/prod/docker-compose.app.yml`](../infra/prod/docker-compose.app.yml) **`nginx` → `../../apps/web-client/dist`**, header + comment + [`infra/prod/.env.app.example`](../infra/prod/.env.app.example) — **`npm ci` + `npm run build`** before **`compose up`**, rebuild after UI changes.
- [x] **Health & order:** [`infra/prod/docker-compose.app.yml`](../infra/prod/docker-compose.app.yml) — **`messaging-service`** `depends_on` only **rabbitmq** (commented); data-first + smoke documented in file header + [`infra/prod/.env.app.example`](../infra/prod/.env.app.example); [`infra/prod/docker-compose.data.yml`](../infra/prod/docker-compose.data.yml) header: data stack before app.
- [ ] **Deliverable:** `docker compose -f infra/prod/docker-compose.app.yml up -d` + remote Mongo/Redis/RabbitMQ/MinIO (Mongo + MinIO S3 on data host, **`MONGODB_URI`** / **`S3_*`** as above); API + Swagger at **`ekko.biratbhattacharjee.com`**; Socket.IO on **`wss://ekko.biratbhattacharjee.com`** (after PC-4) as today’s proxy model.
- **Depends on:** PC-1 network reachability (**`mongo.biratbhattacharjee.com`**, **MinIO :9000** from app host); PC-3 (network); PC-4 (TLS) for `wss://ekko.biratbhattacharjee.com` / `https://ekko.biratbhattacharjee.com` tests.

### PC-3 — Cross-stack networking (two compose projects / two hosts)

- [x] **Model choice:** [`docs/prod-networking.md`](../docs/prod-networking.md) — **(C) routed L3** (two hosts, env URLs, firewall) as default; **(A)** external `docker network` on one host; **(B)** host mode niche — **not** in **README**.

- [x] **Secrets:** [`docs/prod-secrets.md`](../docs/prod-secrets.md) + calls in [`infra/prod/.env.app.example`](../infra/prod/.env.app.example) / [`.env.data.example`](../infra/prod/.env.data.example) + compose headers; **`.env`** gitignored — **not** in **README**.
- [ ] **Firewall:** allow only app host (public IP of **ekko**) → data host: Mongo (`mongo.biratbhattacharjee.com:27017`), **MinIO S3 (9000)**, Redis, (and TURN as needed); app host inbound 80/443 for **`ekko.biratbhattacharjee.com`**; outbound for Let’s Encrypt if using HTTP-01 for `ekko`.
- [ ] **Deliverable:** small diagram in **prod** docs (**`docs/prod-networking.md`**) — data vs app, ports, **`ekko.biratbhattacharjee.com`**, **`mongo.biratbhattacharjee.com`**, **MinIO :9000** — **not** in **README**.

- **Depends on:** PC-1, PC-2.

### PC-4 — nginx TLS with Certbot (`ekko.biratbhattacharjee.com`) — start order: nginx → certbot → reload

- [ ] **Domain (you):** create **`A`/`AAAA` for **`ekko.biratbhattacharjee.com`** to the **app** host; wait for DNS; keep **80/443** open inbound (Let’s Encrypt **HTTP-01** needs **:80**). No separate `api.` unless you split origins and add CORS.

- [x] **(1) Start nginx first (HTTP, ACME-ready):** [`infra/prod/nginx/nginx.acme-http.conf`](../infra/prod/nginx/nginx.acme-http.conf) — **`listen 80` only**, **`server_name` ekko + localhost**, **`^~ /.well-known/acme-challenge/`** with **`root /var/www/certbot`**; volume **`certbot-www`** in [`infra/prod/docker-compose.app.yml`](../infra/prod/docker-compose.app.yml). Proxies **/v1**, **/socket.io**, **/** SPA as **`nginx.conf`**. **No** **443** here — step (3).

- [x] **(2) Run Certbot (webroot) after nginx is up:** [`infra/prod/docker-compose.app.yml`](../infra/prod/docker-compose.app.yml) — **`certbot`** service (profile **`certbot`**, **`certbot-letsencrypt`** volume, **`depends_on: nginx: healthy`**), no **`--standalone`**. **Script:** [`infra/prod/scripts/certbot-webroot-ekko.sh`](../infra/prod/scripts/certbot-webroot-ekko.sh) + [`docs/prod-acme-nginx.md`](../docs/prod-acme-nginx.md) § (2). Wildcard: **DNS-01** + reload **nginx** after certs.

- [x] **(3) Add TLS to nginx and reload:** implemented in [`infra/prod/nginx/nginx.https.conf`](../infra/prod/nginx/nginx.https.conf) — **`listen 443 ssl`**, **`http2 on;`**, **`ssl_certificate` / `ssl_certificate_key`** under **`/etc/letsencrypt/live/ekko.biratbhattacharjee.com/`**; **nginx** mounts **`certbot-letsencrypt:/etc/letsencrypt:ro`**, **443:443** in [`infra/prod/docker-compose.app.yml`](../infra/prod/docker-compose.app.yml). **`proxy_pass`** to **`messaging-service:3000`** for **`/v1`**, **`/socket.io/`** (WebSocket **Upgrade** / **Connection**), **`/api-docs`**, **`/`** SPA. **Port 80 (ekko):** **`/.well-known/acme-challenge/`** + **`301` → `https`**; a separate **`server` on :80** for **localhost** / **127.0.0.1** leaves HTTP for local health. After **`certonly`**, switch the compose mount to **`nginx.https.conf`**, then **`docker compose up -d` or `exec nginx nginx -s reload`**. Runbook: [`docs/prod-acme-nginx.md`](../docs/prod-acme-nginx.md) § (3).

- [x] **Renewal:** `certbot renew` with **`--webroot`**, then **`nginx -s reload`**: scripts [`infra/prod/scripts/certbot-renew-ekko.sh`](../infra/prod/scripts/certbot-renew-ekko.sh) (renew + reload) and [`reload-nginx-ekko.sh`](../infra/prod/scripts/reload-nginx-ekko.sh) (reload only, for a **`deploy_hook`**). Cert paths, cron/systemd, and host-**certbot** **`deploy_hook`** in **`renewal/...conf`**: [`docs/prod-acme-nginx.md`](../docs/prod-acme-nginx.md) § (4) — **not** the main **README**.

- [x] **Web-client env — build for this environment:** set **`VITE_API_BASE_URL`** to **`https://ekko.biratbhattacharjee.com/v1`**, or **`/v1`** when the SPA and API are same origin, so **`getSocketUrl()`** uses origin **`https://ekko.biratbhattacharjee.com`** and **Socket.IO** over **`wss://`**. Tracked: [`apps/web-client/.env.example`](../apps/web-client/.env.example) (production / split-stack block), notes in [`infra/prod/.env.app.example`](../infra/prod/.env.app.example) and [`docs/prod-s3-and-r2.md`](../docs/prod-s3-and-r2.md).

- [x] **Deliverable:** [`infra/prod/nginx/README.md`](../infra/prod/nginx/README.md) (HTTP first → TLS: **`nginx.acme-http.conf`**, then **`nginx.https.conf`**, compose mount) + [`docs/prod-runbook.md`](../docs/prod-runbook.md) (start order, **`docker compose`**, **Certbot** issue, renew/reload, smoke **`https://ekko.biratbhattacharjee.com/v1/ready`**) — **not** the main **README**.

- **Depends on:** PC-2; **`ekko.biratbhattacharjee.com`** in DNS; ports **80/443** on the app host; **nginx** up before the first **`certonly`**.

### PC-5 — Prod documentation (not the main README)

- [x] **Do not** add a **“two-file deploy” / “production split”** section to [**`README.md`**](../README.md) — the prod stack is out of band for the default project docs. (Policy: root **README** has no such section; see **`.gitignore`** comment and [`docs/prod-runbook.md`](../docs/prod-runbook.md) / **checklist** for prod.)

- [x] **Optional `infra` sample (prod only):** [`infra/.env.prod.example`](../infra/.env.prod.example) — **`MONGODB_URI`**, **`S3_ENDPOINT`**, **`REDIS_URL`**, **`PUBLIC_APP_BASE_URL=https://ekko.biratbhattacharjee.com`**, and TURN / S3 placeholders, plus optional **`BASE_URL`** for **k6**; **not** a replacement for **`infra/dev/.env.example`**.

- [x] **Parity with monolith:** `infra/dev/docker-compose.yml` stays the **local all-in-one**; the split compose files under **`infra/prod/`** are **prod** artifacts only. Stated in [`infra/README.md`](../infra/README.md).

- [ ] **Deliverable:** a teammate can run load tests from **this checklist** + small **`docs/…`** notes if you add them — **not** from **README** alone.

- **Depends on:** PC-1..PC-4.

## API specification (OpenAPI) and Swagger UI

> **Done:** `docs/openapi/openapi.yaml`, Swagger at `/api-docs`, Zod `validate*`, `generate:api` in web-client, README pointers.

- [ ] Optional: restrict Swagger to non-prod or auth
- [ ] Process: update OpenAPI in same PR as route changes (**`docs/PROJECT_PLAN.md` §14** §3)

### Web-client

- [x] README + **openapi-typescript** (`generate:api`)

## Cross-cutting — Runtime configuration (MongoDB)

> **Done:** `system_config` singleton; `getEffectiveRuntimeConfig` Redis + Mongo + env fallback; `emailVerificationRequired`, `guestSessionsEnabled`.

- [ ] **Write path:** internal admin API + seed; **server_secret** auth header
- [ ] **Docs:** env **deprecated** vs **DB-owned**; **TTL** / refresh when write path exists
- [ ] **Tests:** fallback **env → DB**; guest / email branches

## Feature 2 — Sign up / log in (email; verification optional)

> **Done:** register/login/verify/refresh, Argon2, SendGrid when enabled, `ProtectedRoute`, `SessionRestore`, Settings profile + presign avatar, `*.test.tsx` coverage, `formValidation` + `parseApiError`. **Zod** on route bodies in service.

- [ ] **Email verification toggle (DB):** `emailVerificationRequired` from Mongo; deprecate env-only **`EMAIL_VERIFICATION_REQUIRED`** for runtime (keep seed/fallback) — ties **Runtime configuration**
- [ ] **Forgot / reset password** _(deprioritized — backend routes exist; web-client screens later):_ **`forgotPassword`** + **`resetPassword`** (token from email link / query param)

## Cross-cutting — User profile, search, send, pagination

> **Done:** `User` / profile / search / send / pagination per OpenAPI; **Socket.IO** primary send; web-client profile, search, composer new vs follow-up thread.

- [ ] **PR order:** OpenAPI bump (if needed) → **Zod** → route → Mongo (process gate)

## Send path — Socket.IO (target)

> **Done:** `message:send` + ack, `POST /messages` deprecated in docs, client `useSendMessage` + Vitest mock path, OpenAPI narrative.

## Feature 1 — One-to-one messaging

> **Done:** Mongo conversations/messages, RMQ fan-out, user rooms, `message:new` + optimistic UI, E2EE indicator, `listMessages`, integration test, OpenAPI 0.1.18+.

- [ ] **Sent tick** (stub) or full **Feature 12** when ready

## Feature 12 — Read receipts

> **Done:** `receiptsByUserId`, `conversation_reads`, socket + REST, `ReceiptTicks`, fan-out, rate limits, client emit guards.

- [ ] **Feature flags (optional):** hide seen/delivered if user setting disables receipts

## Cross-cutting — Media (AWS S3 / R2)

> **Done:** S3 client, multipart **upload** (legacy), presign, composer presign+PUT, `VITE_*` caps, E2EE media ref in hybrid inner JSON, thread `ThreadMessageMedia`. **R2/MinIO** in Compose.

- [ ] **MongoDB:** message docs store **S3 key** (and optional public URL); access patterns per §14 §2.0
- [ ] **Image fetch without public MinIO / anonymous bucket reads** — keep objects **private**; expose to browser via **one** of:
  - [ ] **(Preferred)** `GET /v1/media/by-key` (or `…/presign`) — authenticated, authz = conversation rules; **redirect** or JSON with short-lived **presigned GetObject**; **OpenAPI** + **Zod** in same PR
  - [ ] **(Alt)** Stream **GetObject** through **messaging-service** (higher load)
  - [ ] **Client:** build **`<img src>`** from that URL; for **E2EE**, resolve **`mediaKey`** before requesting media (no reliance on public bucket for MVP)
- [ ] **Env / docs:** `S3_ANONYMOUS_GET_OBJECT` optional; **`VITE_*`** may become unnecessary if all via API

## Feature 7 — Notifications

> **Done:** RMQ + consumer `notification` + `message:new`; toasts + sounds; E2EE message = sound-only.

- [ ] **Web Push** (optional)
- [ ] **UI — optional:** notification centre; Web Push if (A) implements
- [ ] **DND / mute (Post-MVP, product TBD):** per-user / per-conversation — **design later**

## Feature 3 — 1:1 call

> **Done:** `webrtc:*` signaling, STUN/TURN, hangup, `useWebRtcCallSession`, `CallSessionDock`, Redux `callSlice`, tests.

- [ ] Optional: **Socket.IO** notification events for call state (Feature 7)

## Feature 6 — Last seen

> **Done:** Redis hot + Mongo flush, `presence:getLastSeen`, heartbeat worker, `useLastSeen`, UI. Authz on `getLastSeen` REST mirror deprioritized.

- [ ] Future “invisible” / presence privacy if scoped

## Cross-cutting — Infrastructure and hardening

- [ ] Metrics + health; structured logs; optional OpenTelemetry
- [ ] Rate limits (see **Global rate limiting**), audit logs, secrets, backups, load tests, runbooks

### Web-client

- [ ] Global error boundary + user-friendly API error mapping
- [ ] Optional: analytics hooks; performance budgets

## Scalability testing — k6 + Socket.IO (local runner → deployed instance)

**Goal:** Produce a repeatable methodology and k6 script suite that can run from a local machine against the deployed Ekko instance, measuring Socket.IO messaging behavior, delivery receipts, and supporting service bottlenecks on the CX22 host.

**Prod target (PC stack):** **`https://ekko.biratbhattacharjee.com`** (REST + SPA) and **`wss://ekko.biratbhattacharjee.com`** (Socket.IO) when using the **PC-1..PC-4** environment; **Mongo** at **`mongo.biratbhattacharjee.com`**. Same constraints as **§ Load testing — split Docker**: **not** described in the main **README**.

### ST-1 — Define scalability methodology and pass/fail criteria

- [ ] **Metrics contract:** define exact metrics: Socket.IO connect latency, auth/login latency, `message:send` ack latency, end-to-end `message:new` delivery latency, receipt latency (`message:delivered`, `message:read`, `conversation:read`), throughput (messages/sec, receipts/sec, connected sockets), error rate by event, reconnect count, dropped/duplicate message count, and server resource metrics (CPU, RSS, fd count, Mongo ops, RabbitMQ depth, Redis memory/ops).
- [ ] **Scenario matrix:** specify k6 scenarios for **ramp-up**, **sustained load**, **spike**, and **soak** using deployed Socket.IO endpoint (`/socket.io`) plus REST auth/bootstrap endpoints; include target VU / socket counts, duration, message cadence, receipt behavior, and stop conditions.
- [ ] **Pass/fail thresholds:** set initial thresholds for a messaging system: e.g. p95 `message:send` ack, p95 `message:new` delivery, p99 delivery, receipt p95, Socket.IO connect failure rate, message loss/duplicate rate, HTTP 5xx, Socket.IO disconnect/reconnect rate, RabbitMQ queue growth, Mongo slow ops, Redis errors.
- [ ] **Bottleneck isolation playbook:** define how to isolate app vs MongoDB vs RabbitMQ vs Redis vs nginx/network by selectively running: connect-only, auth-only, send-without-media, receipts-only, receive-only, media-presign-only, and broker-drain observation scenarios.
- **Deliverable:** `docs/scalability-methodology.md` (or **PROJECT_PLAN**) with metric definitions, scenario table, thresholds, and bottleneck isolation matrix — keep the main **README** free of **prod deploy** details; **PC-1..PC-5** in this checklist cover that stack.
- **Depends on:** deployed CX22 instance; Feature 1 Socket.IO send/receive; Feature 12 receipts; health/readiness endpoints.

### ST-2 — Design k6 script architecture for Socket.IO messaging

- [ ] **Script layout:** define `tests/k6/` (or equivalent) with `config.ts/js`, `auth.ts/js`, `socketio.ts/js`, `scenarios/*.ts/js`, and `metrics.ts/js`; parameterize via env: `BASE_URL` (e.g. `https://ekko.biratbhattacharjee.com`), `WS_URL` (e.g. `wss://ekko.biratbhattacharjee.com`), `USER_POOL_FILE`, `RUN_ID`, `MESSAGE_RATE`, `MEDIA_RATIO`, `RECEIPT_MODE`.
- [ ] **Socket.IO lifecycle:** implement VU flow: REST login/refresh → open Socket.IO connection with JWT in `auth.token` and `auth.userId` → wait for `connect` → emit `message:send` with ack → listen for `message:new`, `notification`, receipt fan-out → emit `message:delivered` / `message:read` / `conversation:read` → disconnect cleanly.
- [ ] **JWT handling:** choose auth model for k6: pre-generated user credentials + per-VU login, or pre-minted tokens with refresh; handle access-token expiry during soak with `POST /v1/auth/refresh` and reconnect/update-token logic aligned with `SocketWorkerProvider` / worker behavior.
- [ ] **Realistic behavior model:** implement think time, burst patterns, mixed read/write users, active conversations vs idle sockets, sender/receiver pairing, and receipt timing (delivered immediately on receive, read after configurable dwell time).
- [ ] **Custom metrics:** capture k6 `Trend`, `Rate`, and `Counter` for connect latency, ack latency, delivery latency by message id, receipt latency, event parse errors, ack errors, reconnects, duplicate deliveries, and missing deliveries at teardown.
- **Deliverable:** k6 design note + script skeleton with one runnable connect/send/receive scenario.
- **Depends on:** ST-1 metric definitions; seeded user/conversation strategy from ST-3; Socket.IO protocol names (`message:send`, `message:new`, `message:delivered`, `message:read`, `conversation:read`).

### ST-3 — Define test data and run isolation strategy

- [ ] **User pool:** define pre-seeded users for load tests (e.g. `load-user-0001..N`) with credentials or refresh tokens; split into sender/receiver pairs and optional multi-device users for receipt/reconnect coverage.
- [ ] **Conversation topology:** pre-create deterministic 1:1 conversations for each pair; document whether k6 creates conversations lazily via first `message:send` or a seed script creates them before the run.
- [ ] **Payload mix:** define text vs media ratio (e.g. 95% text / 5% media-presign), message body size distribution, burst size distribution, and whether media tests use presign-only with tiny synthetic payloads or pre-uploaded object keys.
- [ ] **Run isolation:** every run uses `RUN_ID` embedded in message body / metadata-compatible fields; cleanup strategy either deletes test users/conversations/messages by prefix or rotates a fresh test user namespace; document how to avoid polluting real user metrics and dashboards.
- [ ] **Data validation:** post-run verifier checks sent count vs received count vs receipt count, duplicates by message id, missing ack ids, queue drained state, and sample message persistence in MongoDB.
- **Deliverable:** seed/cleanup plan (`scripts/prod-seed*`, `scripts/prod-cleanup*` or documented manual commands) plus `users.json` / generated credentials format for k6.
- **Depends on:** deployed auth APIs; messaging-service DB access or admin seed mechanism; ST-2 script env contract.

### ST-4 — Define CX22 infrastructure monitoring plan

- [ ] **Host metrics:** capture CPU, load average, memory/RSS, swap, disk IO, network IO, open file descriptors, TCP socket states, and process counts for nginx, Node.js, MongoDB, RabbitMQ, Redis, and MinIO during each scenario.
- [ ] **Service metrics:** capture MongoDB ops/sec and slow queries, RabbitMQ queue depth / publish rate / consumer ack rate, Redis memory / ops/sec / rejected connections, nginx request and WebSocket upgrade counts, Node.js event-loop lag if exposed, and Socket.IO connected clients / disconnect reasons if logged.
- [ ] **Collection method:** choose local-to-server collection commands (`ssh` + `docker stats`, `docker compose logs`, `rabbitmqctl`, `redis-cli INFO`, `mongosh serverStatus`) or lightweight exporters; align timestamps with k6 start/end and `RUN_ID`.
- [ ] **Result export:** define output files: k6 JSON summary, CSV/Prometheus-style metrics snapshot, service logs filtered by `RUN_ID`, RabbitMQ/Mongo/Redis snapshots before/after, and a short run manifest (commit SHA, deploy version, env config, k6 command).
- **Deliverable:** `scripts/prod-monitor.sh` (or runbook) that starts/stops monitoring and writes artifacts under `artifacts/prod-k6/<RUN_ID>/`.
- **Depends on:** SSH access to CX22; Docker Compose service names; ST-1 metric contract; ST-3 `RUN_ID`.

### ST-5 — Define prod results documentation structure (prefer `docs/`, not main README)

- [ ] **Report template (docs):** e.g. **`docs/prod-k6-report-template.md`** (or `artifacts/…`) with: environment summary (CX22, service versions, commit SHA, **ekko** / **mongo** only as prod context), scenario table, threshold table, k6 command, dataset size, monitoring method. **Do not** add this as a **“deployment”** section in **README** — optional short **README** pointer (“see `docs/…` for k6 run reports”) is fine.
- [ ] **Charts and tables:** include p50/p95/p99 latency charts for connect, ack, delivery, receipts; throughput over time; error/reconnect rate; connected sockets over time; CPU/memory over time; RabbitMQ queue depth; Mongo ops/slow queries; Redis memory/ops.
- [ ] **Scaling story:** present pragmatic Swedish-engineering style conclusions: what limit was reached first, measured evidence, tradeoff chosen, cost/complexity impact, and next smallest improvement (e.g. tune Node workers, RabbitMQ consumers, Mongo indexes, Redis rate-limit hot paths, nginx/socket limits).
- [ ] **Decision log:** each run records pass/fail against ST-1 thresholds, bottleneck hypothesis, supporting graphs, and recommended next action; avoid vanity numbers without resource context.
- **Deliverable:** prod report template (under **`docs/`** or `artifacts/`) + first “baseline run” placeholder after ST-2..ST-4; **no** full split-stack / domain story in **README**.
- **Depends on:** ST-1 thresholds; ST-2 metrics; ST-4 exported artifacts.

## Feature 8 — Group messaging (post-MVP)

- [ ] (A) Group model + RMQ `message.group.*` + Socket `group:` rooms + membership sync + OpenAPI
- [ ] (B) UI + Redux + hooks + client rooms + group receipt policy

## Feature 10 — Contacts (post-MVP)

- [ ] (A) Collection + APIs + OpenAPI
- [ ] (B) UI + Redux + `useContacts`

## Feature 4 — Group call (post-MVP)

- [ ] (A) SFU decision + Socket group signaling + optional notification kinds
- [ ] (B) UI + state + errors

## Feature 9 — Create groups (post-MVP)

- [ ] (A) APIs + membership → Socket room sync + OpenAPI
- [ ] (B) UI + Redux + validation

## Shipped (historical)

> **Global rate limit (500/min per IP),** nginx `X-Forwarded-For`, stack with per-route limits, 429 + httpClient handling, toasts — **done** (`globalRestRateLimit`, `README`).

> **Feature 2a (guest),** **Feature 5 (search / shell UX)** — **done** (guest rules, `POST /auth/guest`, guest-only search, banners, tests).

---

## Messaging-service legacy cleanup (MC)

> **Done (MC-1..MC-8):** removed dead barrels; pruned `userPublicKeys` re-exports; removed `rankUsersByEmailRelevance`; dropped orphan `createGroupRequestSchema`; trimmed `uploadAuth` / `requireAuth` exports; `patchMeMultipart` module-private; full `vitest` + notes on any pre-existing `tsc` test noise in MC-8.2.

## Web-client legacy cleanup (WC)

> **Done (WC-0..WC-7):** removed unused `store`/`generated` barrels; dead `createGroup` + `API_PATHS.groups`; removed `searchUsersByEmail` + deprecated form validation symbols + `useRegisterPublicKey` alias; ESLint `prefer-const`, dropped stale eslint-disable, **WC-6.3** fast-refresh sidecars (`useSocketWorker`, receipt/thread types); **`npm run lint`** with `--max-warnings 0`, **`tsc`**, full **`vitest`**. (Baseline noise from Apr 2026 is resolved; keep gates on future PRs.)

---

_Checklist **v9.6** — **PC-1..PC-5** = **prod only**; **do not** put split compose / **ekko** / **mongo** deploy in main **README** (checklist + optional **`docs/…`**). **v9.5** PC-4; **v9.1** ST. If you need line-level archaeology, use git history for `docs/TASK_CHECKLIST.md` before this version._
