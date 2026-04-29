#!/usr/bin/env sh
# Used by Compose healthcheck — authenticates as the app user (SCRAM; no URL-encoding of password).
set -eu
DB="${MONGODB_DB_NAME:?MONGODB_DB_NAME required}"
AUTH="${MESSAGING_DB_AUTH_DB:-$DB}"
exec mongosh --quiet \
  "mongodb://127.0.0.1:27017/${DB}" \
  --username "${MESSAGING_DB_USER:?}" \
  --password "${MESSAGING_DB_PASSWORD:?}" \
  --authenticationDatabase "${AUTH}" \
  --eval 'db.adminCommand({ ping: 1 }).ok'
