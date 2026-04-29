#!/usr/bin/env bash
# Write or replace **`DOMAIN_NAME=`** in **`infra/staging/.env`** (does not touch other variables).
#
# Usage (from **`infra/staging`** or elsewhere):
#   ./scripts/set-domain-env.sh staging.example.com
#
set -euo pipefail
DOMAIN="${1:?usage: ./set-domain-env.sh <fqdn.example.com>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$(cd "${SCRIPT_DIR}/.." && pwd)/.env"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Creating ${ENV_FILE} from .env.example — fill secrets before tls-bootstrap." >&2
  cp "$(dirname "${ENV_FILE}")/.env.example" "${ENV_FILE}"
fi

TMP="$(mktemp)"
if grep -q '^DOMAIN_NAME=' "${ENV_FILE}" 2>/dev/null; then
  grep -v '^DOMAIN_NAME=' "${ENV_FILE}" > "${TMP}"
else
  cp "${ENV_FILE}" "${TMP}"
fi
printf '%s\n' "DOMAIN_NAME=${DOMAIN}" >> "${TMP}"
mv "${TMP}" "${ENV_FILE}"
echo "DOMAIN_NAME=${DOMAIN} → ${ENV_FILE}"
