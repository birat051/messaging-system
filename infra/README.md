# Infrastructure layouts

**Parity (monolith vs prod):** [`infra/dev/docker-compose.yml`](dev/docker-compose.yml) remains the **local all-in-one** (Mongo, Redis, RabbitMQ, MinIO, **messaging-service**, **nginx**, optional **coturn** on one host). The split files under [`infra/prod/`](prod/) — **`docker-compose.data.yml`** and **`docker-compose.app.yml`** — are **prod / k6** artifacts (two planes or two hosts), **not** a replacement for the dev stack. Default project setup continues to use **`dev/`**; see the root **`README.md`**.

- **`dev/`** — local single-host stack: **Compose** + **nginx** + **coturn** (dev TURN) + **`.env.example`**. Start from the repo root with  
  `docker compose -f infra/dev/docker-compose.yml up -d`  
  (see the root **`README.md`** for build steps and ports).

- **`.env.prod.example`** — at **`infra/.env.prod.example`**: compact **k6** / split-stack variable checklist (**`MONGODB_URI`**, **`S3_ENDPOINT`**, **`REDIS_URL`**, **`PUBLIC_APP_BASE_URL`**, TURN + S3 placeholders). **Not** a substitute for **`infra/dev/.env.example`**.

- **`prod/`** — split data vs app plane (prod / k6): **`docker-compose.data.yml`**, **`docker-compose.app.yml`**, **nginx** (ACME + TLS), **certbot** issue/renew scripts, env examples, and backup/restore notes. **Runbook:** `docs/prod-runbook.md`. **nginx** configs: `infra/prod/nginx/README.md` (**`nginx.acme-http.conf`** then **`nginx.https.conf`**). **Renewal:** `infra/prod/scripts/certbot-renew-ekko.sh` + `docs/prod-acme-nginx.md` § (4). See **`docs/TASK_CHECKLIST.md`** (PC-1..PC-5) and **`docs/prod-*.md`**.
