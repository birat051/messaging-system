#!/bin/sh
# Render turnserver config from turnserver.prod.template; then exec turnserver.
# Password must not contain sed delimiter "|" (use alphanumeric + - _ . for load tests).
set -e
TPL=/etc/coturn/turnserver.prod.template
OUT=/var/tmp/turnserver.runtime.conf

: "${COTURN_REALM:=ekko.biratbhattacharjee.com}"
: "${COTURN_EXTERNAL_IP:=127.0.0.1}"
: "${COTURN_LT_USER:=turn}"
: "${COTURN_LT_PASS:=prod-coturn-change-me}"

sed -e "s|__COTURN_REALM__|${COTURN_REALM}|g" \
  -e "s|__COTURN_EXTERNAL_IP__|${COTURN_EXTERNAL_IP}|g" \
  -e "s|__COTURN_LT_USER__|${COTURN_LT_USER}|g" \
  -e "s|__COTURN_LT_PASS__|${COTURN_LT_PASS}|g" \
  "$TPL" >"$OUT"

exec turnserver -c "$OUT" --log-file=stdout
