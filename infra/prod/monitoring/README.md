# Prod data plane — Prometheus + Grafana

Runs with **[`../docker-compose.data.yml`](../docker-compose.data.yml)** on the same host as Mongo/Redis/MinIO when you want in-process metrics for **`messaging-service`**.

## Preconditions

1. **`ENABLE_PROMETHEUS_METRICS=true`** in the environment of **`messaging-service`** so **`GET /metrics`** exports Prometheus text.
2. The **messaging-service** process must be reachable from the **Prometheus** container at the address in **`prometheus.yml`** (default **`host.docker.internal:3001`**, matching **`docker-compose.app.yml`** `3001:3000`). For bare **`npm start`** on :3000, edit the target. On Linux, `extra_hosts: host.docker.internal:host-gateway` is set on the Prometheus service.
3. If **`messaging-service`** runs on a **different host** than this compose stack, edit **`prometheus.yml`** `static_configs.targets` to that host’s IP/DNS and port, and ensure the metrics port is **not** exposed to the public internet (firewall / bind to private interface only).

## URLs

- **Prometheus UI:** `http://127.0.0.1:9090` (loopback on the data host; keep private).
- **Grafana:** host port **3001** is published to **all interfaces** (`0.0.0.0:3001`). On a data server with a **public** IP, open **TCP 3001** in the **security group** / firewall *only* if you intend Grafana on the public internet, or use a [compose override](https://docs.docker.com/compose/extends/) to bind `127.0.0.1:3001:3000` for loopback-only. **If you run both** `docker-compose.data.yml` and `docker-compose.app.yml` on the **same** host, remap one of the two (both default to **3001** on the host), e.g. Grafana `3002:3000` in an override to avoid a port bind conflict.
  - **Login:** set **`GRAFANA_ADMIN_USER`** and **`GRAFANA_ADMIN_PASSWORD`** in `.env` (never `admin`/`admin` in production).
  - **Optional** **`GRAFANA_ROOT_URL`:** e.g. `https://grafana.example.com` when you terminate TLS in front of this port.
  - **Optional** **`GRAFANA_SECRET_KEY`:** add `GF_SECURITY_SECRET_KEY` in a compose override to match [Grafana’s env](https://grafana.com/docs/grafana/latest/setup-grafana/configure-grafana/#secret-key) (random 32+ bytes); otherwise Grafana generates one on first start.

## Dashboards

A starter dashboard **messaging-service (Prometheus)** is provisioned with **RSS**, **heap**, **Socket.IO active connections**, **peaks** (`max_over_time`), **HTTP latency (p95)** and **request rate**, and **`message:send` outcomes** by label.

Peaks in Grafana: use **Stat** with **`max_over_time(…[range])`**, or zoom the time range and read **max** in the graph legend.

## Security (public Grafana)

- **Grafana** is not anonymous (`GF_AUTH_ANONYMOUS_ENABLED=false`); use a **strong** admin password; prefer **HTTPS** in front (nginx, ALB, **Cloudflare**, etc.) and restrict **:3001** in the **security group** to **office IP / VPN** if you do not need the whole internet.
- **Prometheus** remains on **127.0.0.1:9090** only; do not expose it without auth.
