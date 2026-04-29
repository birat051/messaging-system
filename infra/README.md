# Infrastructure layouts

**Parity (monolith vs prod):** [`infra/dev/docker-compose.yml`](dev/docker-compose.yml) remains the **local all-in-one** (Mongo, Redis, RabbitMQ, MinIO, **messaging-service**, **nginx**, optional **coturn** on one host). The split files under [`infra/prod/`](prod/) — **`docker-compose.data.yml`** and **`docker-compose.app.yml`** — are **prod / k6** artifacts (two planes or two hosts), **not** a replacement for the dev stack. Default project setup continues to use **`dev/`**; see the root **`README.md`**.

- **`dev/`** — local single-host stack: **Compose** + **nginx** + **coturn** (dev TURN) + **`.env.example`**. Start from the repo root with  
  `docker compose -f infra/dev/docker-compose.yml up -d`  
  (see the root **`README.md`** for build steps and ports).

- **`staging/`** — **single-host** parity with **`dev/`** (Mongo, Redis, RabbitMQ, MinIO, messaging-service, nginx, optional coturn), but nginx publishes **`:80`/`:443`**, and **`scripts/tls-bootstrap.sh`** runs **nginx on HTTP first** (**.well-known/acme-challenge/**), **`certbot certonly --webroot`**, then **reload with TLS** (**`nginx/templates/https.conf.template`**). **`/messaging-media/`** is proxied to MinIO (**`HTTPS`** **`S3`** path-style **`https://${DOMAIN_NAME}`** ↔ **`S3_PUBLIC_BASE_URL`** / **`compose`** default **`https://${DOMAIN_NAME}`**. Prereqs: DNS **`DOMAIN_NAME`** → this host; **`CERTBOT_EMAIL`**, SPA **`dist/`** built. From **`infra/staging`**: **`./scripts/set-domain-env.sh fqdn`** then **`./scripts/tls-bootstrap.sh`**. **`CERTBOT_USE_STAGING=1`** in **`.env`** uses the Let's Encrypt staging CA during rehearsals.

- **`.env.prod.example`** — at **`infra/.env.prod.example`**: compact **k6** / split-stack variable checklist (**`MONGODB_URI`**, **`S3_ENDPOINT`**, **`REDIS_URL`**, **`PUBLIC_APP_BASE_URL`**, TURN + S3 placeholders). **Not** a substitute for **`infra/dev/.env.example`**.

- **`prod/`** — split data vs app plane: **`docker-compose.data.yml`** (Mongo, Redis, MinIO, **RabbitMQ**, …) and **`docker-compose.app.yml`** (**`messaging-service` only** — edge TLS/ALB + static hosting out of band). **nginx** + **Certbot** scripts and **`infra/prod/nginx/*.conf`** are for optional self-managed TLS, not the default app compose. **Runbook:** `docs/prod-runbook.md`. See **`docs/TASK_CHECKLIST.md`** and **`docs/prod-*.md`**.
