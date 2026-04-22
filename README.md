# Ekko

TypeScript **web client** and **Node.js microservice** for real-time **chat**, **presence**, **in-app notifications**, and **WebRTC-oriented** calling. The stack is **OpenAPI-first** (REST contract, codegen to the client, Zod validation on the server), with **Socket.IO** for browser transport and **RabbitMQ** for routing persisted work across processes and replicas. **Docker Compose** runs the full dependency set locally.

## Documentation (three files only)

This repository uses **exactly three** Markdown documents: **`README.md`** (this file — features, architecture summary, diagrams, deployment, **environment variables**), **[`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)** (vision, algorithms, procedures, stack, **§14 engineering standards**), and **[`docs/TASK_CHECKLIST.md`](docs/TASK_CHECKLIST.md)** (delivery backlog). **OpenAPI** lives in **`docs/openapi/openapi.yaml`** (not Markdown). Do not add other `*.md` files; extend these three.

| Layer         | Technology                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client**    | React 18, Vite, TypeScript, Tailwind CSS, Redux Toolkit, React Router, Axios; Socket.IO client in a **Web Worker** so the UI thread stays responsive |
| **API**       | Node.js, Express, TypeScript; OpenAPI 3 spec in **`docs/openapi/`**, Swagger UI, **`openapi-typescript`** for **`apps/web-client/src/generated/`**   |
| **Data**      | MongoDB (primary store), Redis (presence / hot paths), RabbitMQ (post-persist routing), S3-compatible object storage (MinIO in development)          |
| **Real time** | Socket.IO server on **messaging-service** (chat, signaling channel, notification transport)                                                          |

Architecture, scaling, and algorithms: **[`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md)**. Task tracking: **[`docs/TASK_CHECKLIST.md`](docs/TASK_CHECKLIST.md)**. **How to build** (TypeScript, React, MongoDB, tests): **`docs/PROJECT_PLAN.md` §14**. **E2EE multi-device encryption** (hybrid model, per-device keys, message key distribution, send/receive flow, new device key re-sharing): **`docs/PROJECT_PLAN.md` §7.1**.

---

## Overview

The service is designed so **HTTP** handles CRUD and auth, while **Socket.IO** delivers live updates. **RabbitMQ** sits between **MongoDB** persistence and **Socket.IO** emission so multiple instances of **messaging-service** can share work: messages are written once, routed through the broker, then emitted to the correct **user** or **group** rooms. That split is what allows horizontal scaling without treating the WebSocket layer as the system of record.

Documentation in **`docs/`** is the source of truth for behavior; this README summarizes scope, current delivery, and core diagrams.

---

## Product scope

Target capabilities include **direct and group messaging**, **last-seen presence**, **user discovery**, **in-tab notifications** (new messages and incoming calls), and **audio/video** (1:1 and group) with a **TURN** path for restrictive networks. Horizontal scaling leans on **RabbitMQ** (each replica consumes and runs **local in-memory** Socket.IO **`io.to(room).emit`** — **`docs/PROJECT_PLAN.md` §3.2.2**). Full narrative: **`docs/PROJECT_PLAN.md` §1–§3**.

---

## Delivery status

| Area                | Specification                                                                           | Repository today                                                                                                                                                                                                                     |
| ------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Identity**        | Register, login, verification, reset; JWT access + refresh                              | REST APIs per OpenAPI on **messaging-service**; **web-client**: Redux session, shared **`httpClient`**, refresh-on-401 flow — [`apps/web-client/src/common/api/httpClient.ts`](apps/web-client/src/common/api/httpClient.ts)         |
| **Chat (messages)** | Persist → RabbitMQ → Socket.IO rooms                                                    | Broker + Socket.IO + MongoDB integrated on the service; end-user chat UI and full pipeline items tracked in **`TASK_CHECKLIST.md`**                                                                                                  |
| **Presence**        | Redis while connected; flush **last seen** to Mongo                                     | **Live**: **`presence:heartbeat`** (~5 s client) → Redis **`setLastSeen`** (server: **≤ 1 write / 4.5 s** per socket); **`disconnect`** → **`users.lastSeenAt`** + Redis **`DEL`**; **`presence:getLastSeen`** → Redis then Mongo (**`resolveLastSeenForUser`**)                                                                                                      |
| **Media**           | Server-mediated upload to object storage                                                | **`POST /v1/media/upload`** implemented; multipart UX in client backlog                                                                                                                                                              |
| **Notifications**   | Single Socket.IO event **`notification`**, versioned payload — **`PROJECT_PLAN.md` §8** | Contract defined; **emit from domain** (checklist Feature 7) **outstanding**. No separate notification microservice; no Redis Streams for in-tab delivery                                                                            |
| **Calls**           | 1:1 signaling via Socket.IO; STUN/TURN; group SFU at scale                              | **STUN** (default public host or **`VITE_WEBRTC_STUN_URLS`**); **TURN** via **`infra/coturn`** (`--profile turn`) or **managed** credentials (**`VITE_WEBRTC_TURN_*`**); ports in [**WebRTC: ports and ICE**](#webrtc-ports-and-ice) |
| **Operations**      | Compose, nginx, documented env                                                          | Stack exposed on **8080** via nginx (**`apps/web-client/dist/`** bind-mounted as static root, SPA **`index.html`** fallback); **TLS** still follow-up                                                                                |

---

## Future scope

Planned follow-ups: some **polish** the current **Option A** approach (local sender-plaintext in IndexedDB); **Option B** is a **larger protocol change** (new or extended **OpenAPI** / wire payload). **`docs/TASK_CHECKLIST.md`** tracks backlog items; here we summarize **what** each direction solves and **tradeoffs**.

### Option B: dual envelope (protocol)

Today **`E2EE_JSON_V1`** encrypts the message body for the **recipient**. The **sender** cannot decrypt that blob with their own private key, so after a full reload the UI relies on **Option A** (local persistence of “what I typed”) unless something else is added.

**Dual envelope** (or an equivalent) would attach a **second ciphertext** the **sender** can decrypt using their **directory public key** material and **local private key**, so **GET `/conversations/.../messages`** can restore the sender’s readable copy **without** a prior local cache—useful for **new devices**, **cleared storage**, or products that want **server-mediated history** to be decryptable by the sender as well as the recipient. **Security posture:** still **no private keys on the server**; payloads stay **opaque** to the service (same review line as today).

| Dimension     | Summary                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Solves**    | Sender-readable copy from **server-stored** blobs after reload; **multi-device / clean browser** without depending only on IndexedDB; aligns with a stricter story than “plaintext only ever in a local map.”                                                                                                                                                                                               |
| **Tradeoffs** | **Large PR**: **OpenAPI**, **messaging-service** persistence, **web-client** encrypt/decrypt, **backward compatibility** with legacy single-envelope messages; **larger payloads** and more **crypto review**; product must accept that **decrypted plaintext still exists client-side** after decrypt. Option B changes **where** recoverability comes from, not whether humans see plain text in the app. |

### Sender-plaintext persistence (web client)

The client already keeps **own-message plaintext** in **IndexedDB** (scoped by signed-in user), merges it into Redux on session restore, and **write-through** on send ack so full reloads can still show what you typed when the server only stores **E2EE** ciphertext. The items below are **not** required for that baseline; they address **performance, hygiene, security posture, and test coverage** as the product hardens.

| Follow-up                            | What problem it solves                                                                                                                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Optional `sessionStorage` mirror** | IndexedDB is async; a same-tab **JSON mirror** (e.g. key `messaging:senderPlaintext:${userId}`) can make the first paint after navigation **faster** inside one tab. **IndexedDB** remains the source of truth across **full reloads**; the mirror is optional and tab-scoped. |
| **Optional encryption-at-rest**      | Today values may appear as **literal strings** in DevTools. **AES-GCM** (or existing wrap patterns) with a key from **`getOrCreateDeviceScopedPassphrase(userId)`** raises the bar for **casual local inspection**; tradeoff is **CPU + complexity** vs easier debugging.      |
| **Cap + eviction**                   | Without limits, the local store grows with every sent message id. **Max entries per user** (e.g. LRU by `updatedAt`) and/or **TTL** (drop rows older than _N_ days) caps **disk use** and **retention**; eviction on `put` or **`requestIdleCallback`** avoids jank.           |
| **Logout / account switch**          | Call **`clearUser`** on the IndexedDB store (and remove any **`sessionStorage`** mirror) on **logout** or **reset messaging** so a **different user** on the same browser does not inherit the previous account’s **local plaintext** map.                                     |
| **Expanded Vitest**                  | As eviction and policies land, add tests for **put/get/clear/eviction** and **persist → Redux → `hydrateMessagesFromFetch`** with E2EE wire bodies so regressions in **local history** are caught in CI.                                                                       |

---

## Authentication — HTTP client (web)

Access tokens are held **in memory** (Redux). Refresh tokens use **`localStorage`** (key **`messaging-refresh-token`**). The Axios instance attaches **`Authorization: Bearer`** on each request. On **401**, it calls **`POST /v1/auth/refresh`** (request path skips Bearer), uses a **mutex** so concurrent failures share one refresh, retries the refresh **up to three** times with **1 s** spacing between attempts when the error is not an immediate **401/403** from the refresh endpoint, updates the session and rotated refresh token on success, **retries the original request once**, and on hard failure clears storage and navigates to **`/login`**. Environment variables for services: **[Configuration](#configuration-and-environment-variables)** below.

```mermaid
sequenceDiagram
  participant UI as React / Redux
  participant HC as httpClient
  participant API as messaging-service REST
  participant LS as localStorage

  UI->>HC: request (Bearer from Redux accessToken)
  HC->>API: HTTP /v1/...
  alt 200 OK
    API-->>HC: response
    HC-->>UI: data
  else 401
    HC->>LS: read refresh token
    alt no refresh token
      HC->>UI: logout + navigate /login
    else refresh present
      HC->>API: POST /auth/refresh (skip Bearer)
      alt refresh OK
        API-->>HC: AuthResponse
        HC->>UI: setSession(access) + write refresh if rotated
        HC->>API: retry original request once
      else refresh 401/403 or exhausted retries
        HC->>UI: logout + navigate /login
      end
    end
  end
```

---

## Real-time messaging pipeline

After a message is **persisted** in MongoDB, **messaging-service** **publishes** to **RabbitMQ**. Consumers forward to **Socket.IO** rooms so connected clients receive updates. On the client, the Socket.IO connection runs in a **Web Worker** and communicates with the UI via **`postMessage`**. **Direct** traffic uses **user-scoped** routing; **group** traffic uses **group-scoped** keys with **one broker publish per message** (see **`docs/PROJECT_PLAN.md` §3.2–§3.2.1**). Adding service replicas uses **RabbitMQ** so each node can **`io.to(room).emit`** locally; **room membership is not stored in Redis** (**§3.2.2**).

```mermaid
flowchart LR
  subgraph client [web-client]
    WW[Web Worker — Socket.IO]
    UI[UI / Redux]
  end
  MS[messaging-service]
  M[(MongoDB)]
  RMQ[(RabbitMQ)]
  SIO[Socket.IO server]

  UI <-->|postMessage| WW
  WW <--> SIO
  MS --> M
  MS --> RMQ
  RMQ -->|"consume → emit"| SIO
  MS --> SIO
```

---

## WebRTC (video / audio calling)

| Mode      | Direction                                                                                                                      |
| --------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **1:1**   | Offer / answer / ICE over the same Socket.IO connection; **STUN** + optional **TURN** (Compose **coturn** or managed provider) |
| **Group** | Prefer an **SFU** for fan-out at scale; mesh only for small pilots — **`docs/PROJECT_PLAN.md` §6**                             |

Signaling rides on the **same Socket.IO** connection as chat; media is **peer-to-peer** (1:1) or via an **SFU** for groups at scale. Product completeness varies by milestone — see **`docs/TASK_CHECKLIST.md`**.

### WebRTC: ports and ICE

**Socket.IO (signaling)** uses the **same origin** as the REST API: in **Compose**, the browser talks to **nginx** on **`http://localhost:8080`** (path **`/socket.io`**, long-lived HTTP or **WebSocket** upgrade). **`Vite`** dev mode proxies **`/socket.io`** alongside **`/v1`** (**`apps/web-client/vite.config.ts`**). When the SPA is served over **HTTPS**, the browser must use **`https://…`** for **`VITE_API_BASE_URL`** (or same-origin **`/v1`**) so Socket.IO uses **`wss:`** and avoids mixed content.

| Surface                       | Dev (typical)                                                                                                 | Protocol                                | Notes                                                                                                                     |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **REST + Socket.IO entry**    | **8080** (nginx: SPA **`dist/`** + **`/v1`**, **`/socket.io`**, **`/api-docs`** → **messaging-service:3000**) | TCP (HTTP); WS upgrade for `/socket.io` | **`infra/nginx/nginx.conf`**: static **`try_files`** + **Upgrade** / long timeouts on **`/socket.io`**                    |
| **WSS**                       | **443** (or your TLS listener)                                                                                | TCP (HTTPS / **WSS**)                   | Terminate TLS at **nginx**, CDN, or load balancer; same **`/socket.io`** path                                             |
| **STUN / TURN (coturn)**      | **3478**                                                                                                      | **UDP + TCP**                           | STUN binding + TURN over the same listening port (**`infra/coturn/turnserver.conf`**)                                     |
| **TURN relay range (coturn)** | **49152–49200** (host → container)                                                                            | **UDP**                                 | Published in **`infra/docker-compose.yml`**; must allow firewall path for restrictive networks                            |
| **TURNS (optional prod)**     | **5349** (often)                                                                                              | **TCP** / **UDP**                       | **`tls-listening-port`** in coturn; **dev** profile uses **`no-tls`** / **`no-dtls`** — enable for production-style tests |

**Bring up coturn (local):** `docker compose -f infra/docker-compose.yml --profile turn up -d` — static long-term credentials in **`infra/coturn/turnserver.conf`** (`user=dev:turnsecret`) are **dev-only**; production should use **rotated** credentials (TURN REST, or a **managed** TURN vendor — Twilio, Metered.ca, etc.) and lock down **`realm`** / **`allowed-peer-ip`**.

**Web-client ICE** is read at build time from **`getWebRtcIceServers()`** (**`apps/web-client/src/common/utils/webrtcIceServers.ts`**). Defaults include a **public STUN** host for NAT discovery; set **`VITE_WEBRTC_STUN_URLS`** / **`VITE_WEBRTC_TURN_URLS`** (+ **`VITE_WEBRTC_TURN_USERNAME`** / **`VITE_WEBRTC_TURN_CREDENTIAL`** for **coturn**-style auth) in **`.env.production`** / **`.env.development.local`** as needed.

```mermaid
sequenceDiagram
  participant A as "Browser A"
  participant SIO as "Socket.IO (messaging-service)"
  participant B as "Browser B"
  A->>SIO: "signaling: offer, answer, ICE candidates"
  SIO->>B: forward to callee room
  B->>SIO: "signaling: answer, ICE"
  SIO->>A: forward to caller
```

---

## End-to-end encryption (messaging)

Message **payloads** on the wire and at rest are **opaque to the server**: each device holds a unique key pair; a random symmetric **message key** encrypts the payload once, then is encrypted separately per recipient device using their public keys. The server stores the single ciphertext plus a per-device map of encrypted message keys — it never holds private keys or plaintext. Full protocol, send/receive flow, and new-device key re-sharing diagrams: **`docs/PROJECT_PLAN.md` §7.1**.

```mermaid
flowchart LR
  subgraph clientA [Sender device A1]
    SKa[Private key — local only]
    MK[msgKey = random 256-bit]
  end
  subgraph svc [messaging-service]
    REST[REST / Socket.IO]
    DB[(MongoDB: ciphertext + encryptedKeys per device)]
  end
  subgraph clientB [Recipient device B1]
    SKb[Private key — local only]
    PT[Plaintext in UI]
  end
  MK -->|AES encrypt payload| REST
  SKa -->|Enc msgKey per device| REST
  REST --> DB
  DB -->|deliver ciphertext + encKey| clientB
  SKb -->|Dec msgKey → Dec payload| PT
```

---

## In-tab notifications

There is **no** separate notification service and **no** Redis Streams for tab-open delivery. The server emits a **single** Socket.IO event **`notification`** with a **versioned, discriminated** JSON body (`schemaVersion`, `kind`, `notificationId`, `occurredAt`, plus fields per **`kind`**). Typical rooms: **`user:<userId>`** and, where applicable, **`group:<groupId>`**. The client worker forwards payloads to the main thread for UI. Schema: **`docs/PROJECT_PLAN.md` §3.3 & §8**. Emitting from domain logic after message/call events is tracked as **Feature 7** in **`TASK_CHECKLIST.md`**. Scaling follows the same pattern as the rest of the service: more **messaging-service** instances and, if needed, a dedicated gateway later (**§3.3**).

```mermaid
flowchart TB
  subgraph svc [messaging-service]
    DOM[Domain events]
    SIO[Socket.IO]
  end
  subgraph rooms [Rooms]
    U1["user:userId"]
    G1["group:groupId"]
  end
  CLIENT[web-client Worker → UI]

  DOM -->|"emit notification payload"| SIO
  SIO --> U1
  SIO --> G1
  U1 --> CLIENT
  G1 --> CLIENT
```

---

## Local development

**Layout:** **`apps/web-client`** and **`apps/messaging-service`** each have their own **`package.json`**, lockfile, and **`node_modules`** (no workspace hoisting). Monorepo layout and tooling rules: **`docs/PROJECT_PLAN.md` §10**; root **`package.json`** may expose **`install:all`**, **`lint:all`**, **`typecheck:all`**.

**Requirements:** Node.js **≥ 20**, **npm** (10.x recommended).

**Install**

```bash
cd apps/web-client && npm install && cd ../..
cd apps/messaging-service && npm install && cd ../..
```

Or from the repo root: `npm run install:all`.

**Commands (per app)**

```bash
cd apps/web-client
npm run dev          # Vite
npm run typecheck
npm run lint
npm run build        # dist/ for nginx

cd apps/messaging-service
npm run typecheck
npm run lint
npm run build
```

| App               | Path                      |
| ----------------- | ------------------------- |
| web-client        | `apps/web-client/`        |
| messaging-service | `apps/messaging-service/` |

Root convenience scripts: `npm run lint:all`, `npm run typecheck:all`, `npm run format:check:all`.

**OpenAPI:** After changing **`docs/openapi/openapi.yaml`**, run `npm run generate:api` in **`apps/web-client`**; use `npm run generate:api:check` in CI.

**Swagger:** With **messaging-service** running, open **`http://localhost:<PORT>/api-docs`** (default port **3000**). Spec path: **`OPENAPI_SPEC_PATH`** or repo default — see **[Configuration](#configuration-and-environment-variables)**.

---

## Deployment steps

1. **Install:** Node **≥ 20**; from repo root run `npm run install:all` or `npm install` in each of **`apps/web-client`** and **`apps/messaging-service`**.
2. **Configure:** Copy **`infra/.env.example`** to **`.env`** next to Compose if you need overrides; set **`JWT_SECRET`**, **`MONGODB_URI`**, **`REDIS_URL`**, **`RABBITMQ_URL`**, and optional S3/TURN vars per **[Configuration](#configuration-and-environment-variables)**.
3. **Build client (production):** `cd apps/web-client && npm run build` → static assets under **`dist/`** for nginx.
4. **Build service:** `cd apps/messaging-service && npm run build` → **`dist/`** for Node.
5. **Run stack:** `docker compose -f infra/docker-compose.yml up -d --build` from repo root (see table below).
6. **Smoke:** **`http://localhost:8080/`** (SPA), **`/v1/health`**, **`/api-docs`**; optional **`--profile turn`** for WebRTC TURN.

---

## Docker Compose

```bash
docker compose -f infra/docker-compose.yml up -d --build
```

| Service                              | Default access                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------- |
| HTTP, Swagger, Socket.IO (via nginx) | **`http://localhost:8080`** — e.g. **`/api-docs`**, **`/v1/health`**          |
| messaging-service (host port)        | **`http://localhost:3001`**                                                   |
| MongoDB                              | `localhost:27017`                                                             |
| Redis                                | `localhost:6379`                                                              |
| RabbitMQ AMQP                        | `localhost:5672`                                                              |
| RabbitMQ management UI               | **`http://localhost:15672`** (default user **`messaging`** / **`messaging`**) |
| MinIO S3 API / console               | `9000` / **`http://localhost:9001`**                                          |

**TURN (WebRTC):** `docker compose -f infra/docker-compose.yml --profile turn up -d` — UDP/TCP **3478**; development credentials in **`infra/coturn/turnserver.conf`**.

Copy **`infra/.env.example`** to **`.env`** at the compose working directory to override broker/storage defaults.

**Compose-specific notes:** **`OPENAPI_SPEC_PATH`** is set in the Docker image to `/app/openapi/openapi.yaml` when baked. **S3 / MinIO:** Compose may set **`S3_BUCKET`**, **`S3_ENDPOINT`**, **`MINIO_ROOT_*`**, **`S3_PUBLIC_BASE_URL`**, **`JWT_SECRET`** for **`POST /v1/media/upload`**.

### Testing — `message:new` (A → B, real-time)

**Automated (integration):** With **MongoDB**, **Redis**, and **RabbitMQ** running (e.g. `docker compose -f infra/docker-compose.yml up -d mongo redis rabbitmq`), from **`apps/messaging-service`**:

```bash
MESSAGING_INTEGRATION=1 npm run test:integration
```

The suite **always** connects to **`amqp://messaging:messaging@127.0.0.1:5672`** (Compose defaults), ignoring a local **`RABBITMQ_URL`** such as **`guest:guest`** that would otherwise fail the AMQP handshake against the Compose broker. Use **`MESSAGING_INTEGRATION_RABBITMQ_URL`** when your test broker differs.

This runs **`src/integration/messagingSocket.integration.test.ts`**: creates users **A** and **B**, connects **socket.io-client** as **B**, sends from **A** (REST and **`message:send`** paths), asserts **B** receives **`message:new`** (including an **opaque E2EE-style** **`body`** string). It also asserts **multi-device key sync** on the server: **A** sends a hybrid-style payload with **`encryptedMessageKeys`** for **device A** only; **`applyBatchSyncMessageKeys`** adds the wrapped key for **device B**; **`GET`-style listing** via **`listSyncMessageKeysForUserDevice`** returns the row for **B**. That covers persisted shape and sync application; **decrypting the body in a real browser** remains a **manual** check (see below). No browser required for the automated suite.

**Manual (two browsers / two users):** Start the stack (`docker compose -f infra/docker-compose.yml up -d --build` or run **messaging-service** + **web-client** per local dev). Use **two** browser profiles or machines. **Register and sign in** as user **A** in one session and user **B** in the other. Ensure the SPA uses the **same origin** for REST and Socket.IO as documented under **web-client** **`VITE_API_BASE_URL`** (**[Configuration](#configuration-and-environment-variables)** — **“REST + Socket.IO (same origin)”**). Open a **direct** thread from **A** to **B** and send a message; **B** should see the new message in real time while both sessions show **connected**. **Optional:** DevTools → **Network** → **WS** → filter **`socket.io`**, confirm inbound **`message:new`** on **B**’s connection after **A** sends.

**Manual (same account, two devices — historical decrypt):** Sign in as the **same user** in **profile 1** (trusted device). Send at least one **E2EE** message in a conversation so history exists. Open **profile 2** (or another machine), sign in as the **same user** so the app registers a **new device**. In **profile 1**, complete **device key sync** / approval when prompted so wrapped keys are uploaded for the new device. Return to **profile 2**, open the same conversation, and confirm the **earlier message decrypts** (plaintext, not ciphertext). Automated coverage above only validates **Mongo + sync helpers**; Web Crypto + IndexedDB path is this manual step.

---

## Configuration and environment variables

Single reference for variables passed into each deployable (Docker Compose, local runs, CI). **Do not commit secrets.** When you add or rename variables in code, update **`apps/messaging-service/src/config/env.ts`** and this section together.

| Service               | Code / config entry                                         |
| --------------------- | ----------------------------------------------------------- |
| **messaging-service** | `apps/messaging-service/src/config/env.ts`                  |
| **web-client**        | Vite: `import.meta.env.VITE_*` under **`apps/web-client/`** |

**E2EE / private keys:** Client-side key generation and **IndexedDB** persistence require a **secure context** (HTTPS or localhost). Production must serve the SPA over HTTPS.

### messaging-service

| Variable                                     | Required           | Default                               | Description                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                   | no                 | `development`                         | `development` \| `production` \| `test`                                                                                                                                                                                                                                                                                                        |
| `PORT`                                       | no                 | `3000`                                | HTTP listen port                                                                                                                                                                                                                                                                                                                               |
| `LOG_LEVEL`                                  | no                 | `info` in production, else `debug`    | Pino level: `fatal` \| `error` \| `warn` \| `info` \| `debug` \| `trace` \| `silent`                                                                                                                                                                                                                                                           |
| `MONGODB_URI`                                | no                 | `mongodb://127.0.0.1:27017/messaging` | MongoDB connection string                                                                                                                                                                                                                                                                                                                      |
| `MONGODB_DB_NAME`                            | no                 | `messaging`                           | Application database name                                                                                                                                                                                                                                                                                                                      |
| `MONGODB_MAX_POOL_SIZE`                      | no                 | `10`                                  | Max connections in the MongoDB driver pool                                                                                                                                                                                                                                                                                                     |
| `RABBITMQ_URL`                               | no                 | `amqp://guest:guest@127.0.0.1:5672`   | RabbitMQ connection URL                                                                                                                                                                                                                                                                                                                        |
| `MESSAGING_INSTANCE_ID`                      | no                 | host name                             | Unique per process/replica; RabbitMQ queue name                                                                                                                                                                                                                                                                                                |
| `MESSAGING_REALTIME_DELIVERY_LOGS`           | no                 | `false`                               | When `true`, structured logs for each **`message:new`** / receipt emit from RabbitMQ to Socket.IO (`user:<id>` room, ids) — see **`apps/messaging-service/src/data/messaging/rabbitmq.ts`**                                                                                                                                                    |
| `SOCKET_IO_CORS_ORIGIN`                      | no                 | —                                     | Optional Socket.IO CORS origin                                                                                                                                                                                                                                                                                                                 |
| `REDIS_URL`                                  | no                 | `redis://127.0.0.1:6379`              | Redis (last seen, rate limits, runtime config — **not** Socket.IO rooms; see **`docs/PROJECT_PLAN.md` §3.2.2**)                                                                                                                                                                                                                                |
| `LAST_SEEN_TTL_SECONDS`                      | no                 | `604800`                              | TTL for Redis `presence:lastSeen:{userId}`                                                                                                                                                                                                                                                                                                     |
| `SOCKET_IO_REDIS_ADAPTER`                    | no                 | `false`                               | **Discouraged** — prefer in-memory rooms + RabbitMQ (**`docs/PROJECT_PLAN.md` §3.2.2**)                                                                                                                                                                                                                                                        |
| `OPENAPI_SPEC_PATH`                          | no                 | —                                     | Absolute path to **`openapi.yaml`** when default resolution fails                                                                                                                                                                                                                                                                              |
| `S3_BUCKET`                                  | no                 | —                                     | Enables **`POST /v1/media/upload`** and **`GET`/`POST /v1/media/presign`** when set                                                                                                                                                                                                                                                                 |
| `CLOUDFLARE_R2_ACCOUNT_ID`                   | no                 | —                                     | **Cloudflare R2** only — 32-character **account id** from the dashboard (**server-side**). When **`S3_ENDPOINT`** is unset, defaults to **`https://<id>.r2.cloudflarestorage.com`**. Use with **`S3_BUCKET`** and an R2 **API token** as **`AWS_ACCESS_KEY_ID`** / **`AWS_SECRET_ACCESS_KEY`** (never expose in the web client).                |
| `S3_REGION`                                  | no                 | `us-east-1`                           | AWS SDK region field (R2 accepts **`auto`** or **`us-east-1`** in many setups)                                                                                                                                                                                                                                                                   |
| `S3_ENDPOINT`                                | no                 | —                                     | S3-compatible API URL (**MinIO**, **R2**, etc.); when set, **`AWS_ACCESS_KEY_ID`** / **`AWS_SECRET_ACCESS_KEY`** are required unless using instance metadata on AWS.                                                                                                                                                                               |
| `S3_FORCE_PATH_STYLE`                        | no                 | `false`                               | Path-style URLs for some S3-compatible stores                                                                                                                                                                                                                                                                                                  |
| `S3_KEY_PREFIX`                              | no                 | —                                     | Optional object key prefix                                                                                                                                                                                                                                                                                                                     |
| `AWS_ACCESS_KEY_ID`                          | with `S3_ENDPOINT` | —                                     | Access key                                                                                                                                                                                                                                                                                                                                     |
| `AWS_SECRET_ACCESS_KEY`                      | with `S3_ENDPOINT` | —                                     | Secret key                                                                                                                                                                                                                                                                                                                                     |
| `S3_PUBLIC_BASE_URL`                         | no                 | —                                     | No trailing slash — optional public **`url`** in upload responses; when **`S3_ENDPOINT`** is an internal hostname (e.g. **`http://minio:9000`** in Docker), also used (before **`S3_ENDPOINT`**) as the API origin when signing browser **`PUT`** URLs so clients hit **`http://localhost:9000`** (or your published MinIO host) instead of **`minio`** |
| `S3_PRESIGN_ENDPOINT`                        | no                 | —                                     | Optional override for pre-signed **`PUT`** URL signing only — use when **`S3_PUBLIC_BASE_URL`** points at a CDN/read host but uploads must **`PUT`** to the S3 API directly                                                                                                                                                                      |
| `S3_ANONYMOUS_GET_OBJECT`                    | no                 | `false`                               | When **`true`**, applies a bucket policy allowing unauthenticated **`GetObject`** on startup — needed for **MinIO** (objects are private by default) when the browser loads **`img src`** from **`S3_PUBLIC_BASE_URL`**. **Compose** sets this to **`true`** by default. Use **`false`** on AWS if objects stay private behind CloudFront/OAI. |
| `MEDIA_MAX_BYTES`                            | no                 | `104857600`                           | Max multipart upload size (default **100 MiB**) and max **`contentLength`** for **`/v1/media/presign`** — aligns with **`VITE_MEDIA_UPLOAD_MAX_BYTES`**; lower on the server for a stricter cap                                                                                                                                                 |
| `MEDIA_PRESIGN_TTL_SECONDS`                  | no                 | `300`                                 | TTL (**60**–**3600** s) for pre-signed **`PUT`** URLs from **`GET`/`POST /v1/media/presign`**                                                                                                                                                                                                                                                    |
| `JWT_SECRET`                                 | no                 | —                                     | **Required** for auth JWT routes; media upload when Bearer auth enabled                                                                                                                                                                                                                                                                        |
| `EMAIL_VERIFICATION_REQUIRED`                | no                 | `false`                               | Enforce email verification (see tables below)                                                                                                                                                                                                                                                                                                  |
| `GUEST_SESSIONS_ENABLED`                     | no                 | `true`                                | Until overridden by **`system_config`**                                                                                                                                                                                                                                                                                                        |
| `EMAIL_VERIFICATION_TOKEN_TTL_HOURS`         | no                 | `48`                                  | Verification JWT lifetime                                                                                                                                                                                                                                                                                                                      |
| `ACCESS_TOKEN_TTL_SECONDS`                   | no                 | `3600`                                | Access token TTL (registered users)                                                                                                                                                                                                                                                                                                            |
| `REFRESH_TOKEN_TTL_SECONDS`                  | no                 | `604800`                              | Refresh token TTL in Redis (**7 days** default; registered users)                                                                                                                                                                                                                                                                              |
| `GUEST_ACCESS_TOKEN_TTL_SECONDS`             | no                 | `1800`                                | Guest access JWT lifetime (**30 min** default); **`POST /auth/guest`** / guest **`POST /auth/refresh`**                                                                                                                                                                                                                                        |
| `GUEST_REFRESH_TOKEN_TTL_SECONDS`            | no                 | `1800`                                | Guest refresh token TTL in Redis (**30 min** default); align with guest access TTL                                                                                                                                                                                                                                                             |
| `GUEST_DATA_TTL_ENABLED`                     | no                 | `true`                                | When **`true`**, guest **`users`** / guest↔guest **conversations** / **messages** may set **`guestDataExpiresAt`** for MongoDB TTL (overridable via **`system_config.guestDataTtlEnabled`**)                                                                                                                                                   |
| `GUEST_DATA_MONGODB_TTL_SECONDS`             | no                 | `86400`                               | Horizon (seconds) from insert for **`guestDataExpiresAt`** when guest data TTL is enabled                                                                                                                                                                                                                                                      |
| `GUEST_AUTH_RATE_LIMIT_WINDOW_SEC`           | no                 | `3600`                                | **`POST /auth/guest`** fixed window (per IP + optional fingerprint)                                                                                                                                                                                                                                                                            |
| `GUEST_AUTH_RATE_LIMIT_MAX_PER_IP`           | no                 | `20`                                  | Max guest sign-in attempts per client IP per window                                                                                                                                                                                                                                                                                            |
| `GUEST_AUTH_RATE_LIMIT_MAX_PER_FINGERPRINT`  | no                 | `10`                                  | Max guest sign-ins per **`X-Client-Fingerprint`** per window (when header sent)                                                                                                                                                                                                                                                                |
| `GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER` | no                 | `30`                                  | Max **`POST /messages`** / **`message:send`** per **guest** **`userId`** per **`MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC`** (registered users use **`MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER`**)                                                                                                                                                        |
| `PASSWORD_RESET_TOKEN_TTL_HOURS`             | no                 | `1`                                   | Reset JWT lifetime                                                                                                                                                                                                                                                                                                                             |
| `PASSWORD_RESET_WEB_PATH`                    | no                 | `/reset-password`                     | Web path for reset links                                                                                                                                                                                                                                                                                                                       |
| `FORGOT_PASSWORD_RATE_LIMIT_WINDOW_SEC`      | no                 | `3600`                                | Forgot-password window per IP                                                                                                                                                                                                                                                                                                                  |
| `FORGOT_PASSWORD_RATE_LIMIT_MAX`             | no                 | `5`                                   | Max forgot-password per IP per window                                                                                                                                                                                                                                                                                                          |
| `REGISTER_RATE_LIMIT_WINDOW_SEC`             | no                 | `3600`                                | Register window per IP                                                                                                                                                                                                                                                                                                                         |
| `REGISTER_RATE_LIMIT_MAX`                    | no                 | `5`                                   | Max registrations per IP per window                                                                                                                                                                                                                                                                                                            |
| `RESEND_RATE_LIMIT_WINDOW_SEC`               | no                 | `3600`                                | Resend verification window                                                                                                                                                                                                                                                                                                                     |
| `RESEND_RATE_LIMIT_MAX`                      | no                 | `3`                                   | Max resends per email per window                                                                                                                                                                                                                                                                                                               |
| `VERIFY_EMAIL_RATE_LIMIT_WINDOW_SEC`         | no                 | `3600`                                | Verify-email attempts window per IP                                                                                                                                                                                                                                                                                                            |
| `VERIFY_EMAIL_RATE_LIMIT_MAX`                | no                 | `30`                                  | Max verify attempts per IP per window                                                                                                                                                                                                                                                                                                          |
| `USER_SEARCH_RATE_LIMIT_WINDOW_SEC`          | no                 | `60`                                  | User search window per IP                                                                                                                                                                                                                                                                                                                      |
| `USER_SEARCH_RATE_LIMIT_MAX`                 | no                 | `60`                                  | Max user searches per IP per window                                                                                                                                                                                                                                                                                                            |
| `GUEST_USER_SEARCH_RATE_LIMIT_WINDOW_SEC`    | no                 | `60`                                  | Guest **`GET /users/search`** window (separate Redis key **`ratelimit:users-search:guest-ip:*`**)                                                                                                                                                                                                                                              |
| `GUEST_USER_SEARCH_RATE_LIMIT_MAX`           | no                 | `30`                                  | Max guest searches per IP per window (stricter than **`USER_SEARCH_RATE_LIMIT_MAX`**)                                                                                                                                                                                                                                                          |
| `USER_SEARCH_MIN_QUERY_LENGTH`               | no                 | `3`                                   | Minimum search query length                                                                                                                                                                                                                                                                                                                    |
| `USER_SEARCH_MAX_CANDIDATE_SCAN`             | no                 | `200`                                 | Max MongoDB users scanned per search                                                                                                                                                                                                                                                                                                           |
| `PUBLIC_KEY_FETCH_REQUIRE_DIRECT_THREAD`     | no                 | `false`                               | Restrict **`GET /users/{id}/devices/public-keys`** (other than self) to existing DM                                                                                                                                                                                                                                                            |
| `PUBLIC_KEY_UPDATE_RATE_LIMIT_WINDOW_SEC`    | no                 | `3600`                                | Device register/delete window per user                                                                                                                                                                                                                                                                                                         |
| `PUBLIC_KEY_UPDATE_RATE_LIMIT_MAX`           | no                 | `30`                                  | Max device register/delete actions per user per window                                                                                                                                                                                                                                                                                         |
| `PUBLIC_KEY_JSON_BODY_MAX_BYTES`             | no                 | `8192`                                | Max JSON body for **`POST /users/me/devices`**                                                                                                                                                                                                                                                                                                 |
| `DEVICE_SYNC_RATE_LIMIT_WINDOW_SEC`          | no                 | `3600`                                | **`POST /v1/users/me/sync/message-keys`** — Redis fixed window per **authenticated user** (batch wrapped-key upload). If unset, **`DEVICE_SYNC_BATCH_RATE_LIMIT_WINDOW_SEC`** is used when set.                                                                                                                                                |
| `DEVICE_SYNC_RATE_LIMIT_MAX`                 | no                 | `120`                                 | Max batch uploads per user per window. If unset, **`DEVICE_SYNC_BATCH_RATE_LIMIT_MAX`** is used when set.                                                                                                                                                                                                                                      |
| `DEVICE_SYNC_BATCH_JSON_BODY_MAX_BYTES`      | no                 | `524288`                              | Max JSON body size (bytes) for **`POST /v1/users/me/sync/message-keys`**                                                                                                                                                                                                                                                                       |
| `MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC`         | no                 | `60`                                  | Message send window                                                                                                                                                                                                                                                                                                                            |
| `MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER`       | no                 | `120`                                 | Max sends per user per window                                                                                                                                                                                                                                                                                                                  |
| `MESSAGE_SEND_RATE_LIMIT_MAX_PER_IP`         | no                 | `360`                                 | Max sends per IP per window                                                                                                                                                                                                                                                                                                                    |
| `MESSAGE_SEND_RATE_LIMIT_MAX_PER_SOCKET`     | no                 | `120`                                 | Max **`message:send`** per socket per window                                                                                                                                                                                                                                                                                                   |
| `MESSAGE_RECEIPT_RATE_LIMIT_WINDOW_SEC`      | no                 | `60`                                  | Receipt events window                                                                                                                                                                                                                                                                                                                          |
| `MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_USER`    | no                 | `600`                                 | Max receipt events per user per window                                                                                                                                                                                                                                                                                                         |
| `MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_IP`      | no                 | `2000`                                | Max receipt events per IP per window                                                                                                                                                                                                                                                                                                           |
| `MESSAGE_RECEIPT_RATE_LIMIT_MAX_PER_SOCKET`  | no                 | `600`                                 | Max receipt events per socket per window                                                                                                                                                                                                                                                                                                       |
| `WEBRTC_SIGNAL_RATE_LIMIT_WINDOW_SEC`        | no                 | `60`                                  | WebRTC signaling (**`webrtc:*`**) window                                                                                                                                                                                                                                                                                                       |
| `WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_USER`      | no                 | `2000`                                | Max signaling events per user per window                                                                                                                                                                                                                                                                                                       |
| `WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_IP`        | no                 | `6000`                                | Max signaling events per IP per window                                                                                                                                                                                                                                                                                                         |
| `WEBRTC_SIGNAL_RATE_LIMIT_MAX_PER_SOCKET`    | no                 | `2000`                                | Max signaling events per socket per window                                                                                                                                                                                                                                                                                                     |
| `GLOBAL_RATE_LIMIT_WINDOW_SEC`               | no                 | `60`                                  | Global REST per-IP window (Redis TTL)                                                                                                                                                                                                                                                                                                          |
| `GLOBAL_RATE_LIMIT_MAX`                      | no                 | `500`                                 | Max REST requests per IP per window (**~500/min** default)                                                                                                                                                                                                                                                                                     |
| `SENDGRID_API_KEY`                           | no                 | —                                     | SendGrid when **`EMAIL_VERIFICATION_REQUIRED`**                                                                                                                                                                                                                                                                                                |
| `EMAIL_FROM`                                 | with SendGrid      | —                                     | Verified sender                                                                                                                                                                                                                                                                                                                                |
| `PUBLIC_APP_BASE_URL`                        | with SendGrid      | —                                     | Web origin for verification links                                                                                                                                                                                                                                                                                                              |
| `EMAIL_VERIFICATION_WEB_PATH`                | no                 | `/verify-email`                       | Verify page path                                                                                                                                                                                                                                                                                                                               |

#### Object storage (MinIO, AWS S3, Cloudflare R2)

**Server-only secrets:** **`AWS_ACCESS_KEY_ID`**, **`AWS_SECRET_ACCESS_KEY`** (for **Cloudflare R2**, create an **API token** with bucket read/write and map its **Access Key ID** / **Secret** here), **`S3_BUCKET`**, and either **`S3_ENDPOINT`** or **`CLOUDFLARE_R2_ACCOUNT_ID`** (defaults **`https://<accountId>.r2.cloudflarestorage.com`**). Never put these in **`VITE_*`** or any client bundle.

**Client-direct upload:** **`GET`/`POST /v1/media/presign`** (Bearer JWT) returns a short-lived pre-signed **`PUT`** URL (**`MEDIA_PRESIGN_TTL_SECONDS`**, default **300** s) so the browser can **`PUT`** bytes straight to the bucket. **`POST /v1/media/upload`** remains the multipart path through the API.

#### Global vs per-route rate limits (stacking)

The **global** per-IP limit runs **first** on **`/v1`**; route-specific Redis limits **stack** (separate keys). Tuning: lower **`GLOBAL_RATE_LIMIT_MAX`** for a broad cut, or individual **`REGISTER_*`**, **`USER_SEARCH_*`**, **`DEVICE_SYNC_RATE_LIMIT_*`** (multi-device key sync batch upload), etc. for one surface.

**Reverse proxy:** **`infra/nginx/nginx.conf`** sets **`X-Forwarded-For`** for **`getClientIp`**. Edge **`limit_req`** stacks with app limits unless you tune intentionally.

#### User search policy (`GET /v1/users/search`)

Substring match on normalized email and username; abuse controls include **`USER_SEARCH_MIN_QUERY_LENGTH`**, **`USER_SEARCH_MAX_CANDIDATE_SCAN`**, **`limit`** response cap, **`USER_SEARCH_RATE_LIMIT_*`** (registered callers), **`GUEST_USER_SEARCH_RATE_LIMIT_*`** (guest callers — **guest-only** result set: **`isGuest: true`** only; registered users never appear), and **`GLOBAL_RATE_LIMIT_*`**. See **`docs/openapi/openapi.yaml`**.

#### Email verification (`EMAIL_VERIFICATION_REQUIRED`)

| Server setting        | Register                              | New `emailVerified`        | Verify / resend routes                                         |
| --------------------- | ------------------------------------- | -------------------------- | -------------------------------------------------------------- |
| **`false`** (default) | Issues tokens                         | **`true`** immediately     | Verify/resend return **400** **`EMAIL_VERIFICATION_DISABLED`** |
| **`true`**            | May return null access until verified | **`false`** until verified | Normal flow                                                    |

#### Runtime configuration (MongoDB)

**Collection:** **`system_config`**, singleton **`{ _id: 'singleton' }`**. Fields **`emailVerificationRequired`**, **`guestSessionsEnabled`**, **`guestDataTtlEnabled`** (MongoDB TTL for guest sandbox data — **`guestDataExpiresAt`** on user / conversation / message rows) override env when present. Cached in Redis (**~5 min**); see **`getEffectiveRuntimeConfig`** in code.

#### Guest sessions (Feature 2a — temporary access)

**Product rules (locked)** — see also **`docs/PROJECT_PLAN.md`** (Security — guest sessions) and **`docs/TASK_CHECKLIST.md`** Feature 2a for implementation.

- **Session & refresh TTL:** guest access JWTs and opaque refresh tokens use **`GUEST_ACCESS_TOKEN_TTL_SECONDS`** and **`GUEST_REFRESH_TOKEN_TTL_SECONDS`** (defaults **1800** seconds = **30 minutes** each), independent of registered-user **`ACCESS_TOKEN_TTL_SECONDS`** / **`REFRESH_TOKEN_TTL_SECONDS`**. Redis **`EX`** on refresh keys matches the guest refresh TTL.
- **Privilege ceiling:** guests cannot use **profile/settings** updates (**`PATCH /v1/users/me`**; **`403`** **`GUEST_ACTION_FORBIDDEN`**) or password‑reset / email‑verification flows for guest accounts (**`POST /auth/reset-password`**, **`POST /auth/verify-email`**). **Register** is a separate unauthenticated flow. There is no admin or billing in **messaging-service**; E2EE public-key routes and messaging stay available so guests can chat in the sandbox.
- **Rate limits:** **`POST /auth/guest`** is capped per client IP (**`GUEST_AUTH_RATE_LIMIT_*`**); optional header **`X-Client-Fingerprint`** enables a second per-fingerprint bucket. Outgoing chat sends use a stricter per-**guest**-**userId** cap (**`GUEST_MESSAGE_SEND_RATE_LIMIT_MAX_PER_USER`**) in the same window as **`MESSAGE_SEND_RATE_LIMIT_WINDOW_SEC`**, in addition to shared IP/socket limits.
- **Persistence (MongoDB):** Guest accounts are rows in **`users`** with **`isGuest: true`** and **no** **`email`** field (sparse unique index on **`email`** applies only to registered users). **`username`** and optional **`displayName`** are stored. When **`GUEST_DATA_TTL_ENABLED`** / **`system_config.guestDataTtlEnabled`** is **true** (default), **`guestDataExpiresAt`** is set on **new** guest users and on **guest↔guest** direct **conversations** and **messages** for MongoDB TTL indexes (**`expireAfterSeconds: 0`**). When **`false`**, those fields are omitted (no TTL cleanup).
- **Guest ↔ guest messaging only:** guests **cannot** message **registered** users. Guests may **only** message **other guests** (same guest identity rules on the server). Do **not** allow guest → registered DMs, conversation creation to a registered **`recipientUserId`**, or any path that lets a guest target a full account over chat.
- **Username before guest sign-in:** full **Feature 2** registration (email, password, verification) is **not** required for a guest session, but the visitor **must** provide a **username** (validated; uniqueness policy per implementation) **before** **`POST /v1/auth/guest`** (or equivalent) issues tokens. Optional **display name** may be collected in addition.
- **Guest-only search directory:** when the authenticated user is a **guest**, **`GET /v1/users/search`** and any **user directory / picker** used to start a direct thread **must return only other guests** so guests can find **only peers in the guest sandbox** to open a conversation — **registered users must not appear** in those results.
- **No guest → registered via search or send:** replace any narrative that guests “search and DM registered users” — that behavior is **out of scope** for guests; **register** is the path to the full directory and to messaging registered users.

### web-client

For **local public** `VITE_*` overrides (API base, **`VITE_S3_PUBLIC_BASE_URL`** / **`VITE_S3_BUCKET`** for thread media URLs, upload cap, WebRTC STUN, etc.), start from **`apps/web-client/.env.example`**: copy the snippets you need into **`apps/web-client/.env.development.local`** or **`apps/web-client/.env.local`** (both are gitignored). **R2/S3 API tokens and secret keys stay server-only** — never add them as `VITE_*` (they would ship in the browser bundle). See **`infra/.env.example`** for messaging-service / Compose secrets.

| Variable                      | Required | Default                          | Description                                                                                                                                                                                                                                                                                                       |
| ----------------------------- | -------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_API_BASE_URL`           | no       | _(relative)_ `/v1` in dev        | REST API path prefix — **must** include **`/v1`**. Used by **`getApiBaseUrl()`**; together with **`getSocketUrl()`** it is the single knob for **HTTP + Socket.IO** (see **REST + Socket.IO** below).                                                                                                             |
| `VITE_S3_PUBLIC_BASE_URL`     | no       | —                                | Public **read** base URL for object storage (no trailing slash) — e.g. MinIO/S3 API origin, CloudFront, or static CDN. Required with **`VITE_S3_BUCKET`** when the browser must build **`<img src>`** (and similar) from **`Message.mediaKey`** and the **public** object origin **differs** from the API origin. |
| `VITE_S3_BUCKET`              | no       | —                                | Bucket name in public URLs; **must** match **messaging-service** **`S3_BUCKET`** (and the same layout as **`S3_PUBLIC_BASE_URL`** on the server).                                                                                                                                                                 |
| `VITE_MEDIA_UPLOAD_MAX_BYTES` | no       | `104857600` (**100 MiB**)        | Max attachment size (bytes) for the chat composer before **`POST /v1/media/presign`**. Invalid/unset values fall back to **100 MiB**. **messaging-service** **`MEDIA_MAX_BYTES`** defaults to the same cap; set a lower server value if the API should reject larger **`contentLength`** than the SPA allows.     |
| `VITE_WEBRTC_STUN_URLS`       | no       | _(default: public STUN in code)_ | Comma-separated **`stun:`** URLs — **`getWebRtcIceServers()`** when unset defaults to **`stun:stun.l.google.com:19302`**                                                                                                                                                                                          |
| `VITE_WEBRTC_TURN_URLS`       | no       | —                                | Comma-separated **`turn:`** / **`turns:`** URLs (e.g. **`turn:127.0.0.1:3478`** with Compose **coturn** on host)                                                                                                                                                                                                  |
| `VITE_WEBRTC_TURN_USERNAME`   | no       | —                                | With **`VITE_WEBRTC_TURN_CREDENTIAL`**, applied to each TURN URL (**coturn** **`lt-cred-mech`**)                                                                                                                                                                                                                  |
| `VITE_WEBRTC_TURN_CREDENTIAL` | no       | —                                | TURN password                                                                                                                                                                                                                                                                                                     |

**REST + Socket.IO (same origin):** **`getApiBaseUrl()`** and **`getSocketUrl()`** in **`apps/web-client/src/common/utils/apiConfig.ts`** both read **`VITE_API_BASE_URL`**. For a **relative** value (e.g. **`/v1`**), the SPA’s **`window.location.origin`** is used for Socket.IO as well, so the Vite dev server must proxy both **`/v1`** and **`/socket.io`** to **messaging-service** (**`apps/web-client/vite.config.ts`**). For an **absolute** URL (e.g. **`http://localhost:8080/v1`** to reach Docker nginx), **`getSocketUrl()`** uses **`http://localhost:8080`** only — REST and **`/socket.io`** stay on the **same host and port**. Production HTTPS pages must use an **`https://`** API base to avoid mixed content. **Compose:** **`infra/nginx/nginx.conf`** serves the built SPA at **`/`** ( **`try_files`** → **`index.html`** ) and proxies **`/v1`**, **`/socket.io`**, and **`/api-docs`** to **messaging-service** (**`Upgrade`** / **`Connection`** on **`/socket.io`**).

**Env / CDN (public `src` for media):** **`VITE_API_BASE_URL`** does **not** supply **`src`** for uploaded blobs. When thread or composer UI needs an HTTP URL from **`Message.mediaKey`**, the client joins **`VITE_S3_PUBLIC_BASE_URL`**, **`VITE_S3_BUCKET`**, and the encoded object key in **`apps/web-client/src/common/utils/mediaPublicUrl.ts`** — mirror **messaging-service** **`S3_PUBLIC_BASE_URL`** and **`S3_BUCKET`** so URLs match object keys after upload. Set **`VITE_S3_PUBLIC_BASE_URL`** + **`VITE_S3_BUCKET`** when the **public** object host (CDN, MinIO on another port, S3 website endpoint, etc.) is **not** the same origin as the API; if either is unset, **`mediaKey`** alone cannot be turned into a URL (local **`blob:`** previews or response **`url`** fields still work).

**Chat media upload (pre-signed PUT):** The composer does **not** send file bytes to **`POST /v1/media/upload`**. It calls **`GET`/`POST /v1/media/presign`**, then **`PUT`**s the file **directly to R2** (or S3-compatible) using the returned URL. The SPA never receives long-lived **secret** keys. Configure the **object bucket** (e.g. Cloudflare R2 **CORS**) to allow **`PUT`** from your web app’s **origin** (and headers your signature requires, typically **`Content-Type`** / **`Content-Length`**). Size limit: **`VITE_MEDIA_UPLOAD_MAX_BYTES`** (default **100 MiB**).

**Tokens:** access JWT in memory (Redux); refresh in **`localStorage`** **`messaging-refresh-token`**. **`POST /v1/auth/refresh`** on **401** — see **`apps/web-client/src/common/api/httpClient.ts`**.

---

Do not commit secrets in **`.env`** files. **Web-client:** use **`apps/web-client/.env.example`** as the template for safe `VITE_*` vars only (**`apps/web-client/.gitignore`** ignores **`.env`** and **`*.local`** overrides).
