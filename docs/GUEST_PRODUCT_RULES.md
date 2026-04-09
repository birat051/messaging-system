# Guest sessions — product rules (Feature 2a)

**Status:** Product policy for **try-the-platform / guest** access. Implementation (OpenAPI, routes, env vars) is tracked in **[`TASK_CHECKLIST.md`](./TASK_CHECKLIST.md)** under *Feature 2a — Guest / try-the-platform*. This document locks **what** the product allows before engineering details are finalized.

---

## 1. Purpose

Visitors may obtain a **temporary guest identity** (display name only, no email) to **search for users** and **exchange direct messages** with registered users, without creating a full account. Guests are **not** full accounts: they do not verify email, set a password, or manage billing.

---

## 2. Session lifetime (TTL)

| Item | Policy |
|------|--------|
| **Guest session** | Time-bounded. Initial target: **access token lifetime of 24 hours** from issuance (no long-lived refresh for guests, or a single short re-issue window — final JWT shape in OpenAPI). |
| **Expiry UX** | Client treats **401** on guest-protected calls as **session ended** → return to guest entry (“Try again” / **Create account**). |
| **Re-entry** | A new **`POST /auth/guest`** may be allowed after expiry; **display-name collision** policy (suffix, uniqueness window) is an implementation detail (see checklist). |

*When implemented, mirror TTL in **`docs/ENVIRONMENT.md`** (e.g. `GUEST_ACCESS_TOKEN_TTL_SECONDS`).*

---

## 3. Rate limits (abuse prevention)

| Surface | Policy |
|---------|--------|
| **`POST /auth/guest`** | Stricter than anonymous browsing. Initial target: **up to 20 creations per hour per client IP** (tune with metrics). Optional secondary cap per client fingerprint header if added later. |
| **Messaging from a guest `userId`** | Guests are higher risk for spam. Initial target: **per-guest daily cap on outbound direct messages** (e.g. **200/day**, server-enforced) plus standard global anti-abuse (same pipeline as registered users where applicable). |
| **Search (`GET /users/search`)** | Same class as registered-user search: **rate limit per authenticated user id** (guest or not) per existing / planned search limits. |

Exact numbers are **defaults**; operations may tighten or loosen per environment.

---

## 4. Who guests can message

| Rule | Policy |
|------|--------|
| **Allowed** | Guests may **search** (email) and **send direct messages** to **normal registered users** (accounts with email/password or SSO — i.e. non-guest, non-system users they are allowed to discover via search). |
| **Discovery** | **Search and message** are core guest capabilities: the web-client exposes **user search** and **composer** for guests the same way as for signed-in users, subject to server authz. |
| **Other guests** | **Guest → guest** messaging is **out of scope** for v1 unless product explicitly enables it later (reduces abuse surface). |
| **Privileged / internal** | Guests **must not** target **admin**, **moderation**, **billing**, or **system** identities. The server rejects sends or hides them in search results (exact mechanism: roles / flags on `User`, blocklists — implementation detail). |

---

## 5. Blocked capabilities (guests cannot)

Guests **cannot** perform actions that imply a **durable account**, **money**, or **control plane** access.

| Area | Policy |
|------|--------|
| **Settings / profile** | Guests **cannot use the settings page** (`/settings` in web-client). No **PATCH /users/me** (avatar, display name beyond guest name policy, status), no email or password management. UI: **hide** or **redirect** to **Create account** / guest banner. |
| **Password & credentials** | No **password change**, **reset**, or **link email** flows while in guest mode. |
| **Billing** | No access to **billing**, **subscriptions**, or **payment** surfaces (present or future). |
| **Admin** | No **admin**, **moderation**, or **tenant** APIs — **403** if a guest token is presented. |

*JWT or **`User`** must carry a **`guest: true`** (or equivalent) claim so **REST** and **Socket.IO** enforce the same rules.*

---

## 6. Allowed surfaces (summary)

| Allowed | Notes |
|---------|--------|
| **Search users by email** | Same **`GET /users/search`** contract as registered users, within rate limits. |
| **Direct messaging** | **POST /messages** (and related read paths) for allowed recipients only. |
| **Core app shell** | Home, threads, composer as implemented for authenticated users — **except** settings and any account-only routes. |

---

## 7. Related documents

| Doc | Role |
|-----|------|
| [`TASK_CHECKLIST.md`](./TASK_CHECKLIST.md) | Feature 2a tasks (API, persistence, AuthZ, web-client). |
| [`PROJECT_GUIDELINES.md`](./PROJECT_GUIDELINES.md) | Engineering conventions (auth from session only, no env-based fake identities). |
| [`ENVIRONMENT.md`](./ENVIRONMENT.md) | Env vars when guest TTL and limits are wired. |
| [`openapi/openapi.yaml`](./openapi/openapi.yaml) | Contract for **`POST /auth/guest`** and **`User.guest`** (or equivalent) when added. |

---

*Revise this file when product changes (e.g. guest-to-guest, groups, or calls for guests).*
