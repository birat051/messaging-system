#!/usr/bin/env bash
# PC-4: **`certbot renew`** over **webroot** (HTTP-01), then **`nginx -s reload`** in the app stack. Run from a **systemd** timer, **cron**, or
# manually. From repo root or any cwd (script resolves the repo). **Not** the main **README**.
#
# `certbot` runs in the same **Compose** `certbot` service as the initial **`certonly`**; **`nginx` must be up** so :80 serves
# **`/var/www/certbot`** (volume **`certbot-www`**). After **`renew`**, the script reloads **nginx** so **`/etc/letsencrypt/live/.../fullchain.pem`**
# updates are applied (replaces a **`--deploy-hook`** to **`nginx -s reload`** that cannot run **Docker** *inside* the **certbot** image).
# Optional dry-run: `CERTBOT_DRY_RUN=1 ./certbot-renew-ekko.sh`
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
COMPOSE=infra/prod/docker-compose.app.yml

RENEW_ARGS=(renew -q --webroot -w /var/www/certbot)
if [[ "${CERTBOT_DRY_RUN:-}" == "1" ]]; then
  RENEW_ARGS=(renew --dry-run --webroot -w /var/www/certbot)
fi

docker compose -f "$COMPOSE" run --rm --profile certbot \
  certbot "${RENEW_ARGS[@]}"

docker compose -f "$COMPOSE" exec -T nginx nginx -s reload
