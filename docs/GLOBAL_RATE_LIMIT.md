# Global REST rate limit (per client IP)

Product target: **500 requests per minute per client IP** on the main REST surface, configurable without code changes.

## Mapping: “500/min” → env

| Intent | Variable | Default | Meaning |
|--------|----------|---------|---------|
| Window length | `GLOBAL_RATE_LIMIT_WINDOW_SEC` | `60` | Sliding window length in **seconds** (Redis TTL on the counter key). |
| Allowance | `GLOBAL_RATE_LIMIT_MAX` | `500` | Max **accepted** requests per IP **per window** (after increment, reject when count **>** max). |

Together, defaults are **500** increments per **60** seconds per IP — often described as **500/min** in ops language. You can change both (e.g. `120` + `1000` for a 2‑minute window with the same average rate).

## Implementation

- **Algorithm:** Redis **fixed-window counter** — `INCR` on a per-IP key; on first increment in a cycle, `EXPIRE` the key for `GLOBAL_RATE_LIMIT_WINDOW_SEC`. Same primitives as other limits: `fixedWindowIncrement` / `rateLimitExceeded` in `apps/messaging-service/src/auth/rateLimitRedis.ts`.
- **Key:** `ratelimit:global:ip:{clientIp}` — see `globalRestRateLimitKey` in `apps/messaging-service/src/rateLimit/globalRestRateLimit.ts`. `{clientIp}` is the string from **`getClientIp(req)`** (honest when **`trust proxy`** is configured and upstream sets **`X-Forwarded-For`** correctly).
- **Express:** `createGlobalRestRateLimitMiddleware` in `apps/messaging-service/src/middleware/globalRestRateLimit.ts` is mounted **early** as `app.use('/v1', …)` in `app.ts` (after JSON + request logging). **`GET /v1/health`** and **`GET /v1/ready`** are **excluded** (inside the mount, **`req.path`** is **`/health`** / **`/ready`**, not **`/v1/…`**). **`/api-docs`** is not under `/v1` and is not counted.
- **Scope:** **HTTP** under **`/v1`** only. **Socket.IO** (upgrade, long-poll) does not pass this Express stack for normal socket traffic; use route/socket limits (**`MESSAGE_SEND_RATE_LIMIT_*`**, etc.).

## Operations: reverse proxy (nginx) and client IP

**Confirmed for this repo:** `infra/nginx/nginx.conf` forwards the real client:

- **`X-Forwarded-For`** — `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;` (standard chain: appends the immediate client, usually the browser, when nginx is the first hop).
- **`X-Forwarded-Proto`** — `$scheme` (http/https).
- **`X-Real-IP`** — `$remote_addr` (direct peer of nginx, often the browser in dev).

**messaging-service** sets **`app.set('trust proxy', 1)`** (`apps/messaging-service/src/app.ts`) so Express treats **one** reverse-proxy hop as trusted for **`req.ip`** / forwarded headers. **`getClientIp(req)`** (`apps/messaging-service/src/auth/getClientIp.ts`) prefers the **first** comma-separated address in **`X-Forwarded-For`**, which is the original client when nginx is the only trusted proxy in front of the app.

**If `X-Forwarded-For` is missing or wrong** (e.g. app exposed directly without nginx, or an extra proxy not appending headers), rate limits key **`ratelimit:*:ip:{ip}`** on **`req.socket.remoteAddress`** — often every user shares **one** IP (bad) or the wrong IP. Fix the proxy chain before tuning **`GLOBAL_RATE_LIMIT_MAX`**.

### Edge throttling vs app throttling (avoid accidental double limits)

| Layer | Default in this repo | Role |
|-------|----------------------|------|
| **nginx** (`infra/nginx/nginx.conf`) | **No** `limit_req` / `limit_conn` | Reverse proxy + WebSocket upgrade only. |
| **messaging-service** | **Yes** — Redis **`GLOBAL_RATE_LIMIT_*`** + per-route limits | Primary policy for **429** + JSON **`RATE_LIMIT_EXCEEDED`**. |

Adding **nginx** `limit_req_zone` / **`limit_req`** (or a CDN/WAF rate limit) **stacks** with app limits: a client can be rejected **twice** (edge **503/429** vs app **429**) with **independent** budgets. That is fine for **defense in depth** only if you **intentionally** set the edge cap **much higher** than the app (e.g. edge stops abuse floods; app enforces product limits) or you **disable** one layer for a path. **Avoid** two **similar** tight limits on the same traffic — you halve the effective allowance or confuse operators.

**Recommendation:** keep **product** rate limits in the app (accurate IP via **`X-Forwarded-For`**, shared Redis across replicas). Use **edge** limits sparingly for coarse protection or when the app is not yet reachable; document any edge limit in runbooks next to **`GLOBAL_RATE_LIMIT_*`**.

## Semantics

### Bursts

This is **not** a token bucket or leaky bucket. Within each window, a client may send up to **`GLOBAL_RATE_LIMIT_MAX`** requests as fast as the network allows (a **burst** at the start of the window). After the counter exceeds the max, requests are rejected until the key expires and a **new** window starts on the next request.

Because the window **starts** when the counter is first incremented after the previous key expired, windows are **per-IP rolling** from “last idle period,” not aligned to clock minutes. Two back-to-back busy periods can allow **up to `2 × GLOBAL_RATE_LIMIT_MAX`** requests over a real-time interval slightly longer than one window length (classic fixed-window edge effect). Tighten policy by lowering **`GLOBAL_RATE_LIMIT_MAX`** or switching to a different algorithm in a future iteration if product requires smoother pacing.

### Clock skew

- **App vs Redis:** Expiry uses **Redis’s** clock for TTL. All **messaging-service** replicas share the **same** Redis counter, so there is no cross-replica drift for “when the window resets.”
- **Client vs server:** Clients do not participate in server-side counting; **no** client clock skew affects enforcement.
- **Proxies / load balancers:** Incorrect **`X-Forwarded-For`** or **`trust proxy`** settings can collapse many users onto one IP or spread one user across many keys — fix network config rather than tuning numbers alone.

### Relationship to per-route limits (stacking)

**Policy:** **stack** — do **not** remove existing route limits. The global middleware increments **`ratelimit:global:ip:{ip}`** on (almost) every **`/v1`** request **before** the route runs. Handlers that already enforce limits keep **separate** Redis keys, for example:

| Endpoint / area | Route limit env (examples) | Route Redis key pattern (examples) |
|-----------------|----------------------------|--------------------------------------|
| **`POST /auth/register`** | `REGISTER_RATE_LIMIT_*` | `ratelimit:register:ip:{ip}` |
| **`POST /auth/forgot-password`** | `FORGOT_PASSWORD_RATE_LIMIT_*` | `ratelimit:forgot-password:ip:{ip}` |
| **`POST /auth/verify-email`** | `VERIFY_EMAIL_RATE_LIMIT_*` | `ratelimit:verify-email:ip:{ip}` |
| **`POST /auth/resend-verification`** | `RESEND_RATE_LIMIT_*` | `ratelimit:email:{hash}` (per email) |
| **`GET /users/search`** | `USER_SEARCH_RATE_LIMIT_*` | `ratelimit:users-search:ip:{ip}` |
| **`POST /messages`** (and socket **`message:send`**) | `MESSAGE_SEND_RATE_LIMIT_*` | per user, IP, and optionally socket |

**Why stack:** the global cap limits **total** API volume per IP; route caps target **abuse shapes** (credential stuffing, enumeration, spam) with **stricter** thresholds than **500/min**. **Replace** was rejected: dropping route limits would weaken protections on auth flows. **Tier** is expressed by env: tune global vs route **`MAX`** independently.

See **`docs/ENVIRONMENT.md`** — *Global vs per-route rate limits (stacking)*.
