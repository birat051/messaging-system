# nginx — reference configs (`ekko.biratbhattacharjee.com`)

**Not** the repository root **README**. This directory holds **full `server` blocks** for **`default.conf`** (not small `include` fragments) — use with a **self-managed** nginx (VM, sidecar) or as a **template** for load balancer + target group rules (paths **`/v1`**, **`/socket.io`**, **WebSocket upgrade**).

**Default** [`docker-compose.app.yml`](../docker-compose.app.yml) no longer includes nginx; production traffic is expected at an **ALB/NLB** (or similar) in front of **`messaging-service`**, with static assets on S3/CloudFront or a separate static host. For **HTTP-01** Let’s Encrypt, run nginx + Certbot on an instance (or a dedicated small VM) and mount or copy these files as described in [`docs/prod-acme-nginx.md`](../../../docs/prod-acme-nginx.md).

| File | Role |
|------|------|
| **`nginx.acme-http.conf`** | **PC-4 (1)** — **`listen 80` only**. Serves **`/.well-known/acme-challenge/`** from **`certbot-www`**, proxies **`/v1`**, **`/socket.io/`**, **`/api-docs`**, SPA **`/`**. Use for the **first** bring-up and until Let’s Encrypt certificates exist. |
| **`nginx.https.conf`** | **PC-4 (3)** — **`listen 443 ssl`**, **`http2`**, PEMs under **`/etc/letsencrypt/live/ekko.biratbhattacharjee.com/`**. **Port 80** for **`ekko`**: ACME path + **`301` → https**; **localhost/127.0.0.1 :80** unchanged for local health. |

**Flow (self-managed nginx):** mount **`nginx.acme-http.conf`** as **`default.conf`** → start nginx → run **Certbot webroot** ([`../scripts/certbot-webroot-ekko.sh`](../scripts/certbot-webroot-ekko.sh)) → switch to **`nginx.https.conf`** → **`nginx -s reload`**. **Renewal:** [`../scripts/certbot-renew-ekko.sh`](../scripts/certbot-renew-ekko.sh); details in [`docs/prod-acme-nginx.md`](../../../docs/prod-acme-nginx.md).

**End-to-end order and smoke tests:** [`docs/prod-runbook.md`](../../../docs/prod-runbook.md).
