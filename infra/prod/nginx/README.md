# nginx — prod app host (`ekko.biratbhattacharjee.com`)

**Not** the repository root **README**. This directory holds **full `server` blocks** used as **`default.conf`** (not small `include` fragments). The stack is **HTTP / ACME first**, then **TLS**, by **swapping** which file is bind-mounted in [`docker-compose.app.yml`](../docker-compose.app.yml).

| File | Role |
|------|------|
| **`nginx.acme-http.conf`** | **PC-4 (1)** — **`listen 80` only**. Serves **`/.well-known/acme-challenge/`** from **`certbot-www`**, proxies **`/v1`**, **`/socket.io/`**, **`/api-docs`**, SPA **`/`**. Use for the **first** bring-up and until Let’s Encrypt certificates exist. |
| **`nginx.https.conf`** | **PC-4 (3)** — **`listen 443 ssl`**, **`http2`**, PEMs under **`/etc/letsencrypt/live/ekko.biratbhattacharjee.com/`**. **Port 80** for **`ekko`**: ACME path + **`301` → https**; **localhost/127.0.0.1 :80** unchanged for local health. |

**Flow:** mount **`nginx.acme-http.conf`** → `docker compose … up -d` → run **Certbot webroot** ([`../scripts/certbot-webroot-ekko.sh`](../scripts/certbot-webroot-ekko.sh)) → change the compose volume to **`nginx.https.conf`** → `up -d` or **`nginx -s reload`**. **Renewal:** [`../scripts/certbot-renew-ekko.sh`](../scripts/certbot-renew-ekko.sh); details in [`docs/prod-acme-nginx.md`](../../../docs/prod-acme-nginx.md).

**End-to-end order and smoke tests:** [`docs/prod-runbook.md`](../../../docs/prod-runbook.md).
