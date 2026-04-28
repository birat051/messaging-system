#!/usr/bin/env bash
# PC-4 (2): issue a cert with **webroot** while **nginx** serves :80 (no **certbot --standalone**).
# Prereq: `docker compose -f infra/prod/docker-compose.app.yml up -d` (nginx healthy), DNS for **ekko** → this host if public HTTP-01.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
: "${CERTBOT_EMAIL:?Set CERTBOT_EMAIL (e.g. export CERTBOT_EMAIL=you@example.com)}"

STAGING_ARGS=()
if [[ "${CERTBOT_STAGING:-}" == "1" ]]; then
  STAGING_ARGS=(--test-cert)
fi

exec docker compose -f infra/prod/docker-compose.app.yml run --rm --profile certbot \
  certbot certonly \
  --webroot -w /var/www/certbot \
  -d ekko.biratbhattacharjee.com \
  --agree-tos -m "$CERTBOT_EMAIL" \
  --non-interactive \
  "${STAGING_ARGS[@]}"
