# Infrastructure layouts

**Parity (monolith vs prod):** [`infra/dev/docker-compose.yml`](dev/docker-compose.yml) remains the **local all-in-one** (Mongo, Redis, RabbitMQ, MinIO, **messaging-service**, **nginx**, optional **coturn** on one host). The split files under [`infra/prod/`](prod/) — **`docker-compose.data.yml`** and **`docker-compose.app.yml`** — are **prod / k6** artifacts (two planes or two hosts), **not** a replacement for the dev stack. Default project setup continues to use **`dev/`**; see the root **`README.md`**.

- **`dev/`** — local single-host stack: **Compose** + **nginx** + **coturn** (dev TURN) + **`.env.example`**. Start from the repo root with  
  `docker compose -f infra/dev/docker-compose.yml up -d`  
  (see the root **`README.md`** for build steps and ports).

- **`.env.prod.example`** — at **`infra/.env.prod.example`**: compact **k6** / split-stack variable checklist (**`MONGODB_URI`**, **`S3_ENDPOINT`**, **`REDIS_URL`**, **`PUBLIC_APP_BASE_URL`**, TURN + S3 placeholders). **Not** a substitute for **`infra/dev/.env.example`**.

- **`prod/`** — split data vs app plane: **`docker-compose.data.yml`** (Mongo, Redis, MinIO, **RabbitMQ**, …) and **`docker-compose.app.yml`** (**`messaging-service` only** — edge TLS/ALB + static hosting out of band). **nginx** + **Certbot** scripts and **`infra/prod/nginx/*.conf`** are for optional self-managed TLS, not the default app compose. **Runbook:** `docs/prod-runbook.md`. See **`docs/TASK_CHECKLIST.md`** and **`docs/prod-*.md`**.
