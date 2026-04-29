#!/usr/bin/env bash
# 1. Render **`nginx/nginx/templates/http-acme.conf.template`** → **`nginx/generated/default.conf`** (**`__DOMAIN_NAME__`**).
# 2. **`docker compose up -d`** — **nginx** listens on **:80** (+ **:443** exposed). **Nginx** **`depends_on`** **`messaging-service`**
#    **`service_started`** (not **`healthy`)** so **ACME** (**`/.well-known/...`**) can succeed while the API is still warming up.
# 3. **`certbot certonly --webroot`** (HTTP-01) using **`DOMAIN_NAME`**.
# 4. Switch to **`https.conf.template`** and **`nginx -s reload`** (**TLS enabled** on **:443**).
#
# Prerequisites: **`dns`** **`A`/AAAA`** for **`DOMAIN_NAME`** → this host; ports **80/443** open.
# **`CERTBOT_EMAIL`**, **`DOMAIN_NAME`** in **`.env`**. Optionally **`CERTBOT_USE_STAGING=1`** (Let's Encrypt staging CA).
#
# Usage (repository root optional):
#   cd infra/staging && cp .env.example .env  # merge secrets / JWT_SECRET / PUBLIC_APP_BASE_URL
#   ./scripts/set-domain-env.sh app.staging.example.com
#   ./scripts/tls-bootstrap.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${ROOT}"

if [[ ! -f .env ]]; then
  echo "Missing infra/staging/.env — copy infra/staging/.env.example and configure." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source .env
set +a

: "${DOMAIN_NAME:?Set DOMAIN_NAME (./scripts/set-domain-env.sh example.com)}"
: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL in .env (required for Lets Encrypt)}"

TEMPLATE_HTTP="${ROOT}/nginx/templates/http-acme.conf.template"
TEMPLATE_HTTPS="${ROOT}/nginx/templates/https.conf.template"
OUT_CONF="${ROOT}/nginx/generated/default.conf"
mkdir -p "$(dirname "${OUT_CONF}")"

substitute_domain() {
  sed "s#__DOMAIN_NAME__#${DOMAIN_NAME}#g" "$1"
}

substitute_domain "${TEMPLATE_HTTP}" > "${OUT_CONF}"

echo "Rendered HTTP (${DOMAIN_NAME}). Starting stack…"

docker compose -f docker-compose.yml up -d

CERTBOT_OPTS=(certonly --webroot -w /var/www/certbot -d "${DOMAIN_NAME}" --agree-tos -m "${CERTBOT_EMAIL}" --non-interactive)
if [[ "${CERTBOT_USE_STAGING:-}" == "1" || "${CERTBOT_USE_STAGING:-}" == "true" ]]; then
  CERTBOT_OPTS+=(--staging)
fi

echo "Requesting TLS certificate (${DOMAIN_NAME})…"

docker compose --profile certbot -f docker-compose.yml run --rm certbot "${CERTBOT_OPTS[@]}"

substitute_domain "${TEMPLATE_HTTPS}" > "${OUT_CONF}"

echo "Applying HTTPS nginx config…"
docker compose -f docker-compose.yml exec nginx nginx -t
docker compose -f docker-compose.yml exec nginx nginx -s reload

echo "Done. SPA + API → https://${DOMAIN_NAME}/"
echo "Public S3 path-style proxy (anonymous GET / presigned PUT): https://${DOMAIN_NAME}/messaging-media/…"
