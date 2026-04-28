#!/usr/bin/env bash
# PC-4: reload **nginx** after a certificate change (e.g. `certbot renew`). Prod only; **not** the main README.
# Usable as **`deploy_hook`** in `renewal/ekko...conf` if **certbot** runs on the **host** with the same **Compose** app stack.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ROOT"
exec docker compose -f infra/prod/docker-compose.app.yml exec -T nginx nginx -s reload
