# k6 load tests

Install [k6](https://k6.io/docs/get-started/installation/) **≥ 0.49**. Start the target **messaging-service** and use a JSON user pool (see `users.example.json`).

## Configure

1. Copy **`env.example`** to **`.env`** in this directory (`.env` is gitignored).
2. Set **`USER_POOL_FILE`** to your pool file **relative to `tests/k6/`** (e.g. `users.json`), or `tests/k6/users.json` — same as from repo root after normalization. Copy from `users.example.json` and use real test accounts.

All variables are listed in **`env.example`** (they become k6’s `-e` / `__ENV` at runtime).

**JMeter-style stepping (default in `scenarios/stepping.js`):** `K6_RAMP_UP_DURATION` is split into `K6_RAMP_STEPS` equal stages (0 → target VUs), then `K6_SUSTAIN_DURATION` holds, then a stepped **ramp down** to 0. Omit `K6_RAMP_DOWN_DURATION` to mirror the ramp up duration; set `0s` to skip ramp down.

## Run

From the **repository root** (so paths in `env.example` match):

```bash
set -a && source tests/k6/.env && set +a
k6 run tests/k6/scenarios/stepping.js
```

Or pass env inline:

```bash
k6 run -e BASE_URL=http://localhost:8080/v1 -e WS_URL=http://localhost:8080 -e USER_POOL_FILE=users.json \
  tests/k6/scenarios/stepping.js
```

**npm** (repo root): `npm run k6:stepping` · `npm run k6:smoke` (short stepping) · `npm run k6:seed-users` · `npm run k6:validate-summary`
