# Ekko

**Ekko is an open-source, end-to-end encrypted messaging platform** built for privacy-first teams and developers who want full control over their communication infrastructure. Self-host it on your own servers — your messages never touch a third-party service.

Real-time chat, presence indicators, media sharing, and 1:1 audio/video calls, with a horizontally scalable architecture that grows with you.

---

## Why Ekko?

Most messaging platforms ask you to trust them with your data. Ekko flips that model: private keys never leave devices, the server stores only ciphertext, and the entire stack is open source and auditable.

- **True E2EE** — AES-256-GCM message encryption; per-device keys; server is blind to message content
- **Self-hosted** — run on any Linux server; no vendor lock-in; your data, your rules
- **Horizontally scalable** — RabbitMQ-backed WebSocket fan-out means you add replicas without restructuring
- **OpenAPI-first** — every REST endpoint is formally specified; type-safe client generated from the spec
- **Production-ready stack** — MongoDB, Redis, RabbitMQ, S3-compatible storage, nginx — all wired together and documented

---

## Features

| Capability                                  | Status     |
| ------------------------------------------- | ---------- |
| Direct & group messaging                    | ✅ Live    |
| End-to-end encryption (hybrid, per-device)  | ✅ Live    |
| Real-time delivery via Socket.IO + RabbitMQ | ✅ Live    |
| Last-seen presence                          | ✅ Live    |
| Message delivery receipts                   | ✅ Live    |
| Media uploads (S3-compatible)               | ✅ Live    |
| User discovery                              | ✅ Live    |
| In-tab notifications                        | ✅ Live    |
| 1:1 audio/video (WebRTC, STUN/TURN)         | ✅ Live    |
| Guest sandbox sessions                      | ✅ Live    |
| JWT auth with refresh token rotation        | ✅ Live    |
| Rate limiting                               | ✅ Live    |
| Horizontal scaling (multi-replica)          | ✅ Live    |
| Group SFU video                             | 🗓 Roadmap |
| TLS termination (nginx)                     | 🗓 Roadmap |

---

## Architecture

Ekko is a two-app monorepo: a **React web client** and a single **Node.js microservice** (`messaging-service`). HTTP handles auth and CRUD; Socket.IO delivers live events. RabbitMQ sits between persistence and emission so multiple `messaging-service` replicas can share work without coupling the WebSocket layer to the database.

| Layer              | Technology                                                                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Client**         | React 18, Vite, TypeScript, Tailwind CSS, Redux Toolkit, React Router, Axios; Socket.IO client runs in a **Web Worker** to keep the UI thread responsive |
| **API**            | Node.js, Express, TypeScript; OpenAPI 3 spec in `docs/openapi/`; Swagger UI at `/api-docs`; `openapi-typescript` generates client types                  |
| **Real-time**      | Socket.IO server on `messaging-service`; chat, WebRTC signaling, and notifications on the same connection                                                |
| **Data**           | MongoDB (primary store), Redis (presence + rate limits), RabbitMQ (cross-replica message routing), S3-compatible object storage                          |
| **Infrastructure** | Docker Compose, nginx reverse proxy, optional coturn TURN server                                                                                         |

Full architecture, scaling strategy, and algorithms live in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md).

---

## Real-time messaging pipeline

Messages are written once to MongoDB, then routed through RabbitMQ so every replica can emit to local Socket.IO rooms — no Redis-backed room fan-out required. On the client, the Socket.IO connection runs in a Web Worker, communicating with Redux via `postMessage` to keep the UI thread free.

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

Adding replicas is a horizontal scale-out: each new `messaging-service` instance connects to RabbitMQ and can emit to any user or group room independently. See [`docs/PROJECT_PLAN.md §3.2`](docs/PROJECT_PLAN.md) for the full fan-out design.

---

## End-to-end encryption

Message payloads are opaque to the server at rest and on the wire. Each device generates a unique key pair locally. A random 256-bit symmetric key encrypts the message body once; that key is then wrapped separately for each recipient device using their public key. The server stores the single ciphertext plus a per-device map of encrypted message keys — it never holds a private key or plaintext.

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

Full protocol, send/receive flow, multi-device key re-sharing, and the sender-readable copy design are documented in [`docs/PROJECT_PLAN.md §7.1`](docs/PROJECT_PLAN.md).

---

## Authentication

Access tokens are held in memory (Redux). Refresh tokens use `localStorage`. The Axios client attaches `Authorization: Bearer` on every request, uses a mutex so concurrent 401s share one refresh attempt, retries up to three times with 1s spacing, and navigates to `/login` on hard failure.

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

## Audio & video calling (WebRTC)

1:1 calls use WebRTC with signaling over the same Socket.IO connection as chat — no separate signaling server needed. STUN is available by default; TURN is optional via the bundled coturn container or any managed provider.

| Mode      | Approach                                                  |
| --------- | --------------------------------------------------------- |
| **1:1**   | Offer / answer / ICE over Socket.IO; STUN + optional TURN |
| **Group** | SFU preferred at scale; mesh for small pilots (roadmap)   |

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

### WebRTC ports

| Surface                  | Default       | Protocol         | Notes                                             |
| ------------------------ | ------------- | ---------------- | ------------------------------------------------- |
| REST + Socket.IO (nginx) | `8080`        | TCP / WS upgrade | SPA, `/v1`, `/socket.io`, `/api-docs`             |
| WSS (production)         | `443`         | HTTPS / WSS      | TLS at nginx or load balancer                     |
| STUN / TURN (coturn)     | `3478`        | UDP + TCP        | Enable with `--profile turn`                      |
| TURN relay range         | `49152–49200` | UDP              | Must be open in firewall for restrictive networks |
| TURNS (optional prod)    | `5349`        | TCP / UDP        | Enable TLS in coturn for production               |

---

## In-tab notifications

There is no separate notification service. `messaging-service` emits a single Socket.IO event `notification` with a versioned, discriminated JSON payload (`schemaVersion`, `kind`, `notificationId`, `occurredAt`). The client Web Worker forwards payloads to the main thread. Scaling follows the same RabbitMQ fan-out pattern as messages.

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

## Getting started

### Requirements

- Node.js ≥ 20
- Docker + Docker Compose

### 1. Clone and install

```bash
git clone https://github.com/your-org/ekko.git
cd ekko
npm run install:all
```

Or install per app:

```bash
cd apps/web-client && npm install && cd ../..
cd apps/messaging-service && npm install && cd ../..
```

### 2. Configure environment

Copy the env templates and fill in your secrets:

```bash
cp apps/messaging-service/.env.example apps/messaging-service/.env
cp apps/web-client/.env.example apps/web-client/.env.development.local
cp infra/dev/.env.example infra/dev/.env
```

Key variables to set: `JWT_SECRET`, `MONGODB_URI`, `RABBITMQ_URL`, `REDIS_URL`. S3/MinIO, email, and WebRTC are pre-wired for local dev with defaults.

### 3. Build the client

```bash
cd apps/web-client && npm run build
```

This outputs static assets to `apps/web-client/dist/`, served by nginx.

### 4. Start the stack

```bash
docker compose -f infra/dev/docker-compose.yml up -d --build
```

| Service                    | URL                                            |
| -------------------------- | ---------------------------------------------- |
| Web app + API (nginx)      | http://localhost:8080                          |
| Swagger UI                 | http://localhost:8080/api-docs                 |
| Health check               | http://localhost:8080/v1/health                |
| messaging-service (direct) | http://localhost:3001                          |
| MongoDB                    | localhost:27017                                |
| Redis                      | localhost:6379                                 |
| RabbitMQ AMQP              | localhost:5672                                 |
| RabbitMQ management        | http://localhost:15672 (messaging / messaging) |
| MinIO S3 API               | localhost:9000                                 |
| MinIO console              | http://localhost:9001                          |

To enable WebRTC TURN locally:

```bash
docker compose -f infra/dev/docker-compose.yml --profile turn up -d
```

---

## Development

Per-app commands:

```bash
# web-client
cd apps/web-client
npm run dev          # Vite dev server
npm run typecheck
npm run lint
npm run build        # production build → dist/

# messaging-service
cd apps/messaging-service
npm run typecheck
npm run lint
npm run build
```

Root convenience scripts: `npm run lint:all`, `npm run typecheck:all`, `npm run format:check:all`.

**After changing the OpenAPI spec** (`docs/openapi/openapi.yaml`), regenerate client types:

```bash
cd apps/web-client && npm run generate:api
```

Use `npm run generate:api:check` in CI to catch drift.

---

## Testing

### Integration tests (automated)

Start the data services, then run the integration suite from `apps/messaging-service`:

```bash
docker compose -f infra/dev/docker-compose.yml up -d mongo redis rabbitmq

MESSAGING_INTEGRATION=1 npm run test:integration
```

The suite (`src/integration/messagingSocket.integration.test.ts`) creates two users, connects Socket.IO clients, sends messages via REST and the `message:send` event, and asserts the recipient receives `message:new` in real time — including multi-device E2EE key sync via `applyBatchSyncMessageKeys`.

If your local RabbitMQ credentials differ from the Compose defaults, set `MESSAGING_INTEGRATION_RABBITMQ_URL`.

### Manual testing (two browsers)

Start the full stack and open two browser profiles. Register and sign in as user A in one, user B in the other. Open a direct thread from A to B and send a message — B should receive it in real time. Confirm in DevTools → Network → WS → filter `socket.io`.

### Manual E2EE history test (same account, two devices)

Sign in as the same user in profile 1 (trusted device). Send at least one E2EE message. Open profile 2, sign in as the same user (registers a new device). Complete device key sync in profile 1. Return to profile 2 and confirm the earlier message decrypts correctly — verifying the full Web Crypto + IndexedDB path.

---

## Configuration reference

All secrets and runtime config are environment-variable driven. Never commit `.env` files.

| Scope                                                                                | File                                  |
| ------------------------------------------------------------------------------------ | ------------------------------------- |
| messaging-service (MongoDB, Redis, RabbitMQ, JWT, S3, rate limits, email, guest TTL) | `apps/messaging-service/.env.example` |
| web-client (public `VITE_*` variables, inlined at build time)                        | `apps/web-client/.env.example`        |
| Docker Compose (broker, MinIO, service wiring)                                       | `infra/dev/.env.example`              |

To add or rename a server-side variable: update `apps/messaging-service/src/config/env.ts` (Zod `loadEnv()`) and `apps/messaging-service/.env.example` together.

**E2EE and device keys** require a secure context (HTTPS or localhost) — Web Crypto and IndexedDB are browser security APIs.

---

## Deployment

### Single-instance (portfolio / small team)

A single Hetzner CX22 (2vCPU, 4GB, ~€4/mo) running all services via Docker Compose is sufficient for a live demo or small team. Lock down internal service ports (`mongo`, `redis`, `rabbitmq`) using `expose` instead of `ports` in a production Compose override, and terminate TLS at nginx with Let's Encrypt.

### Horizontal scaling

To scale `messaging-service` replicas, add instances pointing at the same MongoDB, Redis, and RabbitMQ. Each replica consumes from RabbitMQ and runs local `io.to(room).emit` — no Redis-backed Socket.IO room state needed. See [`docs/PROJECT_PLAN.md §3.2.2`](docs/PROJECT_PLAN.md) for the full design rationale.

---

## Roadmap

- TLS termination in nginx (Let's Encrypt)
- GDPR data export and account deletion flow
- AsyncAPI spec for Socket.IO events
- Group video (SFU)
- Dual E2EE envelope for sender-readable server history (Option B — see [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md))
- Mobile clients

---

## Documentation

This repository uses exactly three Markdown documents:

| File                     | Purpose                                                                  |
| ------------------------ | ------------------------------------------------------------------------ |
| `README.md`              | Product overview, features, architecture, quickstart (this file)         |
| `docs/PROJECT_PLAN.md`   | Vision, algorithms, engineering standards, E2EE protocol, scaling design |
| `docs/TASK_CHECKLIST.md` | Delivery backlog and feature status                                      |

The OpenAPI contract lives in `docs/openapi/openapi.yaml`. Socket.IO event shapes are documented there in prose. Do not add other `.md` files — extend these three.

---

## Contributing

Ekko is open source and welcomes contributions. Before opening a PR, read the engineering standards in [`docs/PROJECT_PLAN.md §14`](docs/PROJECT_PLAN.md) — they cover TypeScript conventions, test expectations, OpenAPI discipline, and commit style.

---

## License

[MIT](LICENSE)
