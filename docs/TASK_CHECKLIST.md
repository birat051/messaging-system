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

- [ ] **Domain (you):** create **`A`/`AAAA` for **`ekko.biratbhattacharjee.com`** to the **app** host; wait for DNS; keep **80/443** open inbound (Let’s Encrypt **HTTP-01** needs **:80\*\*). No separate `api.` unless you split origins and add CORS.

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

- [x] **Observability (prod data host):** Prometheus + Grafana in **`infra/prod/docker-compose.data.yml`**, scrape **`messaging-service`** via **`GET /metrics`** ( **`ENABLE_PROMETHEUS_METRICS`**, `apps/messaging-service/src/observability/prometheus.ts`, starter dashboard in **`infra/prod/monitoring/`**)
- [ ] OpenTelemetry; structured log tuning beyond current Pino
- [ ] Rate limits (see **Global rate limiting**), audit logs, secrets, backups, load tests, runbooks

### Web-client

- [ ] Global error boundary + user-friendly API error mapping
- [ ] Optional: analytics hooks; performance budgets

## Scalability testing — k6 + Socket.IO (local runner → deployed instance)

**Goal:** Characterize **how far a single `messaging-service` replica** (one Node process / one container behind nginx on CX22) can scale **concurrent Socket.IO connections** and **1:1 DM throughput**, with **client-observed latency and throughput** and **`messaging-service` server metrics** (CPU, memory, open fds; optional event-loop / structured logs) as the primary evidence. **Supporting** infra (MongoDB, RabbitMQ, Redis) explains _why_ the node stopped scaling — not the headline for “one-box socket ceiling.”

**1:1 wire surface:** REST — `POST /v1/auth/login`, `POST /v1/auth/refresh`, `GET /v1/health` / ready; optional `GET` users/me, conversations, messages. Socket.IO — `message:send` → ack, `message:new`; receipts optional for pure **socket ceiling** runs — see **[`docs/scalability-methodology.md`](docs/scalability-methodology.md)** §2.

**Prod target (PC stack):** **`https://ekko.biratbhattacharjee.com`** (REST + SPA) and **`wss://ekko.biratbhattacharjee.com`** (Socket.IO) when using the **PC-1..PC-4** environment; **Mongo** at **`mongo.biratbhattacharjee.com`**. Same constraints as **§ Load testing — split Docker**: **not** described in the main **README**.

### ST-1 — Define scalability methodology and pass/fail criteria

- [x] **Metrics contract:** **Application-level** metrics (Socket.IO connect, HTTP auth, `message:send` ack, E2E `message:new`, optional receipt E2E, throughput, error rate by event, reconnects, drops/duplicates) — **[`docs/scalability-methodology.md`](docs/scalability-methodology.md)** §1.1–§1.10. **Single-instance `messaging-service` metrics** (CPU %, RSS/heap, open fds, optional event-loop lag; optional nginx WebSocket / upstream) — **§1.11** (same doc).
- [x] **Scenario matrix:** k6 profiles for **ramp-up**, **sustained**, **spike**, **soak** (REST + **`/socket.io`**) with default VU/socket counts, duration, message cadence, **`RECEIPT_MODE`**, and stop conditions — **[`docs/scalability-methodology.md`](docs/scalability-methodology.md)** §4.
- [x] **Pass/fail thresholds:** initial **v1** SLOs for p95/p99 ack and E2E `message:new`, receipt p95/p99, connect-failure and **5xx** rates, loss/duplicate caps, reconnect budget, plus **data-plane** checks (RabbitMQ / Mongo / Redis) when collecting infra — **[`docs/scalability-methodology.md`](docs/scalability-methodology.md)** §5.
- [x] **Bottleneck isolation playbook (1:1):** define how to isolate **`messaging-service`** vs MongoDB vs RabbitMQ vs Redis vs nginx/network with runs such as: **connect-only** (socket ceiling), **auth-only** (REST), **send + `message:new` only** (skip receipts), **receipts-on** (Feature 12 path). Optional later: **media-presign-only**; **omit** group/WebRTC load unless explicitly in scope — **[`docs/scalability-methodology.md`](docs/scalability-methodology.md)** §6.
- **Deliverable:** **[`docs/scalability-methodology.md`](docs/scalability-methodology.md)** — §1 metrics (including **§1.11**), **§2** wire targets, **§4** scenarios, **§5** pass/fail, **§6** bottleneck playbook; main **README** stays free of prod deploy details; **PC-1..PC-5** here cover the stack.
- **Depends on:** deployed CX22 instance; **single** messaging-service target; Feature 1 Socket.IO 1:1 send/receive; Feature 12 receipts (optional for ceiling runs); health/readiness endpoints.

### ST-2 — Design k6 script architecture for Socket.IO messaging (1:1 primary)

- [x] **Script layout:** `tests/k6/` with `config.js`, `auth.js`, `socketio.js`, `metrics.js`, `tags.js`, `user-pool.js`, `iteration.js`, `scenarios/stepping.js`, `validate-k6-summary.mjs`, `users.example.json`, **`env.example`** (copy to `.env` for k6) — how to run: **[`tests/k6/README.md`](../tests/k6/README.md)**; all vars: [`tests/k6/env.example`](../tests/k6/env.example), [`tests/k6/config.js`](../tests/k6/config.js).
- [x] **Socket.IO lifecycle (1:1):** VU flow: REST login/refresh → open Socket.IO with JWT in `auth.token` and `auth.userId` → `connect` → `message:send` with ack → `message:new` on peer; then optional receipt fan-out (`message:delivered` / `message:read` / `conversation:read` per `RECEIPT_MODE`) → clean disconnect. **Socket ceiling** runs may omit receipts — **[`tests/k6/socketio.js`](../tests/k6/socketio.js)** (`k6/websockets`, B-then-A pairing in one VU); **[`tests/k6/iteration.js`](../tests/k6/iteration.js)**.
- [x] **JWT handling:** pre-generated users + per-VU login, or pre-minted `accessToken` / `refreshToken` in the user pool; `resolveUserAuth` in **`tests/k6/auth.js`** keeps a per-VU session cache, calls **`POST /v1/auth/refresh`** when access JWT is within **`K6_JWT_BUFFER_SEC`** of `exp`, then the next **Socket.IO** open uses the new token (reconnect = new handshake, same as app). Soak: long **`K6_SUSTAIN_DURATION`** (stepping hold) with many iterations reuses the cache across iterations in the same VU.
- [x] **Realistic behavior model:** think time, bursts, **sender/receiver pairs**, idle **connected** sockets vs active senders; receipt timing for full runs; **MEDIA_RATIO** is secondary to text 1:1 path — **[`tests/k6/behavior.js`](../tests/k6/behavior.js)**, **[`tests/k6/config.js`](../tests/k6/config.js)** (`K6_THINK_*`, `K6_BURST_*`, `K6_ACTIVE_SEND_PROB`, `K6_IDLE_*`, `K6_RECEIPT_*`, `K6_MEDIA_SIMULATE_SEC`), [`tests/k6/iteration.js`](../tests/k6/iteration.js), [`tests/k6/README.md`](../tests/k6/README.md).
- [x] **Custom metrics:** `Trend` / `Rate` / `Counter` for `sio_connect_ms`, `message_send_ack_ms`, `e2e_message_new_ms`, optional receipt latencies, `msg_send_acked_rps`, `connected_sockets` gauge, errors, reconnects, drops/duplicates — align with **[`docs/scalability-methodology.md`](docs/scalability-methodology.md)** §1.
- **Deliverable:** **[`tests/k6/README.md`](../tests/k6/README.md)** + **`tests/k6/socketio.js`** / **`iteration.js`** (1:1 path); refresh/soak + full metric set still **TODO** (items below).
- **Depends on:** ST-1; ST-3 seed pairs; 1:1 event names above.

### ST-3 — Define test data and run isolation strategy (1:1 pairs)

- [x] **User pool:** pre-seeded users (e.g. `load-user-0001..N`) with credentials; **JSON** array (`email`, `password` per entry); **deterministic 1:1 sender/receiver pairs** — in the pair harness, **concurrent live Socket.IO sessions = 2 × (active VU count)**; with a dedicated pair per VU, **(pool size) = 2 × VUS = total open sockets** — **[`tests/k6/user-pool.js`](../tests/k6/user-pool.js)**, example **`users.example.json`**, **[`tests/k6/env.example`](../tests/k6/env.example)**;
- [x] **Conversation topology:** one **DM** thread per pair; document lazy create vs seed-before-run.
- [x] **Payload mix:** default **text-heavy** (body size distribution) for socket/throughput tests; **media / presign** as optional tranche so primary runs stay on the 1:1 hot path.
- [x] **Run isolation:** `RUN_ID` in message body / metadata; cleanup by prefix or namespace; avoid polluting prod dashboards.
- [x] **Data validation:** post-run checks — sent vs received vs optional receipts; duplicates; drops; optional Mongo sample spot-check.
- **Deliverable:** seed/cleanup plan + `users.json` format for k6; run isolation — `RUN_ID` in [`tests/k6/env.example`](../tests/k6/env.example), [`docs/scalability-methodology.md` §2.6](scalability-methodology.md#26-run-isolation--run_id-cleanup-production-telemetry); data validation — [`docs/scalability-methodology.md` §2.7](scalability-methodology.md#27-post-run-data-validation-k6-json--optional-mongo), `validate-k6-summary.mjs`.
- **Depends on:** deployed auth; DB/admin seed; ST-2 env contract.

### ST-4 — CX22 / prod monitoring (messaging-service first)

- [x] **In-process metrics (source of truth for §1.11 on the Node box):** **`GET /metrics`** (Prometheus text) on **`messaging-service`** with Node **default** metrics (CPU, RSS, heap) plus **`messaging_http_request_*`**, **`messaging_socketio_active_connections`**, **`messaging_socketio_message_send_total{outcome=…}`** — `ENABLE_PROMETHEUS_METRICS`, [`apps/messaging-service/src/observability/prometheus.ts`](../apps/messaging-service/src/observability/prometheus.ts). **Grafana** panels: time series + **peaks** via **`max_over_time`** (e.g. connections, heap) for sustained/spike/runs.
- [x] **Prometheus + Grafana (same host as data stack):** run with **[`infra/prod/docker-compose.data.yml`](../infra/prod/docker-compose.data.yml)** **prometheus** + **grafana** services; scrape target defaults to **`host.docker.internal:3000/metrics`** (see **[`infra/prod/monitoring/README.md`](../infra/prod/monitoring/README.md)**, `prometheus.yml`); set **`GRAFANA_ADMIN_*`** in prod. **Grafana** is the primary time series for k6 and prod correlation; see **[`scripts/README.md`](../scripts/README.md)**.
- [x] **Edge / host (supplementary when nginx in path):** **nginx** — **`stub_status`** (loopback, optional ad hoc), per-location access logs (methodology **§1.11**); not a substitute for in-process /metrics or Grafana — [`infra/prod/nginx/nginx.https.conf`](../infra/prod/nginx/nginx.https.conf) — [`docs/scalability-methodology.md`](docs/scalability-methodology.md).
- [ ] **Supporting data plane (same run, explain saturation):** MongoDB, RabbitMQ, Redis — **as needed** after the app host is read from Prom/Grafana.
- [ ] **Collection + export:** align k6 + `RUN_ID` with Prometheus/Grafana time range; keep **artifacts** (k6 JSON, snapshot exports, short manifest) per methodology.
- **Deliverable:** `infra/prod/monitoring/`, in-process `prometheus.ts`, k6 **RUN_ID** + **summary exports** under **`artifacts/`** (gitignored) as needed.
- **Depends on:** `ENABLE_PROMETHEUS_METRICS` on the target; ST-1; ST-3 `RUN_ID` for correlation.

### ST-5 — Define prod results documentation structure (prefer `docs/`, not main README)

- [ ] **Report template (docs):** e.g. **`docs/prod-k6-report-template.md`** with: **single `messaging-service` replica** called out, CX22 / versions / commit, scenario table, **§5** threshold table, k6 command, user-pair count, **how `messaging-service` was monitored** (§1.11 / ST-4). **Do not** add a **deployment** section to main **README**; optional one-line pointer only.
- [ ] **Charts and tables (priority):** **connected sockets** and **`msg_send_acked_rps` / E2E throughput** over time; **p50/p95/p99** for connect, ack, `message:new`; error/reconnect rates; **`messaging-service` CPU and memory (and fds)** over time. Then: RabbitMQ / Mongo / Redis **as supporting** panels.
- [ ] **Scaling story (single node):** state the observed **socket ceiling** and **throughput** at SLO, what saturated first (**messaging-service** vs broker vs DB), with graphs; then **smallest** next step (horizontal replicas, pool tuning, indexes, nginx limits) — no vanity N without **§1.11** context.
- [ ] **Decision log:** pass/fail vs **§5**; hypothesis; **N** and resource headroom; next action.
- **Deliverable:** report template + baseline placeholder after ST-2..ST-4.
- **Depends on:** ST-1; ST-2 metrics; ST-4 artifacts.

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

- [x] **MC-9 — Observability:** `prom-client` + optional **`/metrics`**, `infra/prod/monitoring` (Prom/Grafana) — **primary** = Prometheus + Grafana (see `scripts/README.md`); no shell sampling scripts.

## Web-client legacy cleanup (WC)

> **Done (WC-0..WC-7):** removed unused `store`/`generated` barrels; dead `createGroup` + `API_PATHS.groups`; removed `searchUsersByEmail` + deprecated form validation symbols + `useRegisterPublicKey` alias; ESLint `prefer-const`, dropped stale eslint-disable, **WC-6.3** fast-refresh sidecars (`useSocketWorker`, receipt/thread types); **`npm run lint`** with `--max-warnings 0`, **`tsc`**, full **`vitest`**. (Baseline noise from Apr 2026 is resolved; keep gates on future PRs.)

---

_Checklist **v9.9** — **k6** user pool: **JSON** array. **ST-4** + Prometheus + Grafana in **data** compose, **`/metrics`** in **messaging-service**; **pair harness** = **2 open sockets per VU** = **2×VUS** = **array length** when one pair per VU. **v9.6** **PC-1..PC-5** = **prod only**; **do not** put split compose / **ekko** / **mongo** deploy in main **README** (checklist + optional **`docs/…`**). If you need line-level archaeology, use git history for `docs/TASK_CHECKLIST.md` before this version._
