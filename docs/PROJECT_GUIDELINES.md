# Project Guidelines

**Authoritative reference** for anyone (human or AI) implementing changes in this codebase. When adding features, APIs, components, or infrastructure, follow this document together with [`PROJECT_PLAN.md`](./PROJECT_PLAN.md) and [`TASK_CHECKLIST.md`](./TASK_CHECKLIST.md).

---

## How to use these documents

| Document | Role |
|----------|------|
| `PROJECT_PLAN.md` | Architecture, tech choices, feature scope |
| `TASK_CHECKLIST.md` | What to build, in what order; check off as you ship |
| **`PROJECT_GUIDELINES.md`** | **How** to build it: TypeScript, Node, MongoDB, APIs, React, tests, and process |

If something here conflicts with a one-off prompt, **these guidelines win** unless the team explicitly updates this file.

---

## 1. Node.js and TypeScript

### 1.1 Language and compiler

- Enable **strict** TypeScript (`"strict": true`, including `strictNullChecks`). Do not disable strictness to “make it compile.”
- Prefer **`unknown`** over `any`. If you must use `any`, document why in a short comment and narrow at the boundary.
- Use **explicit return types** on exported functions, public class methods, and module boundaries so refactors stay safe.
- Prefer **`async`/`await`** for readability; always handle rejections (try/catch or `.catch()` at boundaries). Do not leave floating promises in request handlers.
- Use the **`node:`** prefix for Node built-in imports (e.g. `node:fs`, `node:path`) for clarity and forward compatibility.

### 1.2 Project layout and boundaries

- Organize by **feature** or by **layer** consistently within each app (e.g. `routes` → `services` → `repositories`). Do not mix unrelated concerns in one giant file.
- **HTTP contract:** the **OpenAPI 3** document in `docs/openapi/` is the source of truth for REST. **web-client** generates TypeScript types with **`openapi-typescript`** (`npm run generate:api` in `apps/web-client`)—**no** `packages/shared` package for DTOs. **messaging-service** validates with **Zod** (or equivalent) at the boundary; keep schemas aligned with the OpenAPI spec in the same PR when routes change.
- **Configuration**: validate all required environment variables **at startup** (e.g. with Zod or a small env schema). Fail fast with clear errors if misconfigured.
- **Secrets**: never commit secrets or tokens. Use environment variables or a secrets manager; document required vars in a single place (e.g. `.env.example`).

### 1.3 Express / HTTP services

- Use a **consistent error model**: application errors carry a stable `code`, HTTP status, and safe `message` for clients; map unknown errors to a generic 500 in production without leaking stack traces to clients.
- Apply **security middleware** appropriate to the app: e.g. `helmet`, sensible CORS policy, body size limits, and **rate limiting** on auth and abuse-prone routes.
- Implement **graceful shutdown**: on `SIGTERM`/`SIGINT`, stop accepting new connections, drain in-flight work, close DB/Redis/RabbitMQ connections, then exit.
- Keep **route handlers thin**: parse/validate input, call a service, map result or error to HTTP. Avoid SQL/ODM calls directly inside route files when the same logic is reused.

### 1.4 Async and reliability

- For Redis, RabbitMQ, and MongoDB: use **timeouts**, **retries** where appropriate (with backoff), and **idempotency** for consumers that may redeliver messages.
- **Logging**: structured logs (JSON in production), correlation/request IDs on inbound HTTP and WebSocket traffic, log levels used consistently. Never log passwords, tokens, or full PII.

### 1.5 Dependencies and quality

- Prefer **well-maintained** dependencies; pin versions in lockfiles; run security audits as part of release hygiene.
- **ESLint** (with TypeScript and React rules where applicable) must pass. Fix violations or justify with a rare, documented eslint-disable and follow-up issue.
- **Formatting**: Prettier (or team formatter) **per deployable** (`messaging-service`, `notification-service`, `web-client`) — no style debates in review; automate. This repo does **not** use one Prettier (or TypeScript/ESLint) config at the monorepo root for all apps; **each** microservice keeps **its own** config files (see `TASK_CHECKLIST.md` project setup).

### 1.6 Design patterns (backend — use deliberately)

Apply **named patterns only when they reduce coupling, clarify boundaries, or enable testing**—not for ceremony.

| Pattern / technique | When to use |
|---------------------|-------------|
| **Layered architecture** | Keep HTTP, domain rules, and persistence separate: routes/controllers → **services** (use cases) → **repositories** (data access). Routes do not embed query logic. |
| **Repository** | Abstract MongoDB (or Redis) access per aggregate/collection so services stay persistence-agnostic and unit tests can mock storage. |
| **Service / use-case layer** | One place for business rules (who may message whom, group membership, idempotency). |
| **Strategy** | Swappable implementations (e.g. email provider, push provider, storage backend) selected by config. |
| **Adapter** | Isolate third-party SDKs (S3, email API) behind a small interface owned by the app. |
| **Middleware chain (Express)** | Cross-cutting HTTP concerns: auth, rate limit, validation, error translation — ordered and documented. |
| **Factory** | Complex object creation (e.g. RabbitMQ topology, Redis clients) with shared options and teardown. |

- Prefer **composition** over deep inheritance hierarchies.
- If a pattern choice is non-obvious, add a **one-paragraph rationale** in the PR or a short **ADR** in `docs/` so future changes stay consistent.

---

## 2. Database design and query patterns (MongoDB)

These patterns apply to **MongoDB** as the primary store for users, conversations, messages, groups, and contacts.

### 2.0 Access-pattern-first design (required)

**Schema, indexes, and queries follow from documented access patterns—not the reverse.**

- Before locking a collection shape, list **concrete read/write paths**: e.g. “list messages for conversation X newest-first, page size 50,” “find user by email for login,” “list groups for user U.”
- For each pattern, note **frequency**, **latency expectation**, and **cardinality** (one vs many documents).
- **Every index and query shape** should map to at least one named access pattern. If you add a query for a new screen or API, update the pattern list or add a short note in the same PR.
- Avoid **random** embed vs reference decisions: choose based on **read atomicity**, **update fan-out**, and **document size growth**; write the reasoning in code review or ADR when the tradeoff matters.
- When two designs seem equivalent, prefer the one with **fewer round-trips** for the hot path and **clearer invariants**—and record why.

### 2.1 Modelling

- Prefer **clear ownership** of documents: which service writes which collection; avoid two writers mutating the same field without a defined strategy.
- **Embed** when data is read together, bounded in size, and does not require independent querying across documents (e.g. small metadata on a parent).
- **Reference** (by `ObjectId`) when sub-documents grow unbounded, need independent indexes, or are shared across aggregates (e.g. user profile referenced from many places).
- Store **denormalized fields** only when read patterns justify it; document the invariant and how you keep them consistent (e.g. display name on a message snapshot).

### 2.2 Indexing

- Create **indexes to match real queries**: filter fields, sort fields, and compound queries in the order the query uses (familiarity with **ESR** — Equality, Sort, Range — helps for compound indexes).
- Enforce **uniqueness** at the database layer where the domain requires it (e.g. unique index on `email`).
- Add **partial indexes** when queries always filter on a predicate (e.g. only non-deleted documents).
- Review **index usage** when adding new slow queries; avoid redundant indexes that bloat writes.

### 2.3 Query habits

- **No unbounded reads**: list endpoints must use **pagination** (cursor-based preferred for large collections; offset/limit acceptable for small, stable sets). Always cap `limit` server-side.
- Use **projections** (`select` / second argument to `find`) to return only fields the client needs; large message bodies and media metadata should not be over-fetched by default.
- Avoid **N+1** patterns: batch loads with `$in`, a single aggregation with `$lookup` when appropriate, or denormalize judiciously — measure if `$lookup` is heavy.
- Use **transactions** when multiple documents must commit or roll back together; keep transactions short.
- Prefer **idempotent writes** where external systems or retries exist (e.g. dedupe keys, upserts with clear conditions).

### 2.4 Data lifecycle

- Define policy for **soft delete** vs hard delete and how it interacts with indexes and unique constraints.
- **Migrations** (index creation, backfills) should be **scripted**, **reviewed**, and **tested** on a copy of production-like data when possible; avoid one-off manual edits in production as the norm.

### 2.5 Redis (presence, streams)

- Use **Redis** for hot, ephemeral, or rate-limit data (e.g. last seen) with explicit **TTL** or update strategy to avoid unbounded growth.
- **Redis Streams**: use **consumer groups** for notification delivery; design **stream names and payload schema** as versioned contracts; handle **pending** messages and retries explicitly.

---

## 3. API and domain conventions

- **OpenAPI and Swagger**: maintain an **OpenAPI 3** specification as the source of truth for REST; serve **Swagger UI** from **messaging-service** (see `TASK_CHECKLIST.md`) for interactive docs. Any new or changed REST endpoint must **update the OpenAPI document in the same PR** as the implementation.
- **Versioning**: prefix routes (e.g. `/v1/...`) or document a single API version strategy; avoid breaking changes without a version bump or deprecation path.
- **Validation**: validate every write at the boundary (Zod or equivalent); reject invalid input with **400** and structured error details suitable for clients.
- **Authorization**: authenticate first, then authorize every operation (resource ownership, membership in group/conversation). Do not trust IDs from the client without checks.
- **Idempotency**: for operations that may be retried (e.g. message send with client idempotency key), document and implement deduplication.
- **Pagination response shape**: consistent fields (e.g. `items`, `nextCursor` / `hasMore`) across list endpoints.

---

## 4. React UI and testing (mandatory order)

### 4.1 Tests before implementation for each UI component

- For **each new or substantially changed UI component**, write **unit tests first**, then implement the component to satisfy those tests (**test-first** workflow).
- Tests should describe **behavior** users care about (rendering, interactions, edge cases), not implementation details. Prefer **React Testing Library** with **Vitest** or **Jest** as configured in the repo.
- Cover **accessibility** expectations where relevant: roles, labels, keyboard interaction for critical paths.
- After implementation, ensure tests pass and **ESLint** passes. Refactor only when tests stay green.

### 4.2 UI quality (existing standards)

- **Pixel-perfect**, **soothing** theme: intentional colour, contrast, spacing, and typography.
- **Smooth scroll / section animations** where specified; motion should not harm readability or focus.
- **Accessibility**: keyboard support, visible focus, no keyboard traps, semantic HTML, ARIA when needed, screen-reader-friendly structure.
- **Strong UI/UX**: clarity and hierarchy first; avoid flashy effects that hurt usability.
- **No unnecessary duplication**: small reusable components or data-driven UIs where it reduces repeat markup without over-abstracting.
- **One component per file**: at most one primary exported component per file (helpers/types may coexist per existing rules).
- **Types**: non-prop domain/helper types live in **`types.ts`** in the module; component **props** types may stay with the component file.

### 4.3 State management — Redux and scalable structure

- Use **Redux** via **Redux Toolkit (`@reduxjs/toolkit`)** and **`react-redux`** for **global, cross-cutting client state** (auth session, current user, conversation list caches, notification preferences, connection status, etc.) so the app can grow without ad hoc prop drilling.
- **Redux middleware**: use the store’s **middleware pipeline** for cross-cutting concerns that belong next to dispatches—e.g. structured logging, analytics, **API error normalization**, offline queue hooks (if introduced later)—without scattering that logic across components.
- Organize state by **feature slices** (`createSlice`) colocated with feature folders where practical; register reducers in a single store setup. Prefer **RTK** patterns (`extraReducers`, `createAsyncThunk` when appropriate) over manual boilerplate.
- **Typed hooks**: export typed `useAppDispatch` and `useAppSelector` from a single module (e.g. `store/hooks.ts`) and use them instead of raw `useDispatch`/`useSelector` for type safety.
- **Reusable hooks**: place **custom hooks** in `hooks/` (or per-feature `hooks/`) for shared behavior—e.g. `useAuth()`, `useConversation(conversationId)`—implemented as thin wrappers over selectors, dispatch, and router params. Components should stay presentational where possible; hooks carry composition and subscription logic.
- **Local vs global**: keep **UI-only** state (open/close modal, field focus, transient form state) in **component state** or colocated context when it does not need Redux. Do not put every keystroke in the global store.
- **Testing**: Redux slices and reducers are unit-tested; components remain test-first per §4.1; hooks that contain logic should have tests when non-trivial.

---

## 5. Process and collaboration

### 5.1 Scope and prompts

- Do **not** write code beyond what was requested; avoid speculative features unless explicitly asked.
- Prefer **one clear feature or change** per request so it can be completed and reviewed fully.
- Describe **desired outcomes** (behaviour, UX); let implementation follow these guidelines unless a technical constraint is given.
- Prefer **incremental** changes (“add X to Y”) over large rewrites unless planned.
- For new pages/features/APIs, align on **structure** (URLs, shapes, static vs dynamic) with the plan before deep implementation.

### 5.2 Checklists and tasks

- Use **`TASK_CHECKLIST.md`**: capture work as tasks with subtasks **before** large implementation; mark parent tasks done only when **all** subtasks are done.
- Do not start substantial feature execution until the work is represented in **`TASK_CHECKLIST.md`** as a task with numbered subtasks where applicable (pairs with project rules if present).

### 5.3 Regression and review

- New work must **not break** existing behaviour unless the change is explicitly a replacement; verify related flows still work.
- After changes: **ESLint clean**, **tests** relevant to the area passing, **no extra** unrequested features.

### 5.4 Reference docs in prompts

- When requesting work, point to **`PROJECT_PLAN.md`**, **`PROJECT_GUIDELINES.md`**, and for feature work **`TASK_CHECKLIST.md`**.

---

## 6. Quick compliance checklist (before merge)

- [ ] TypeScript strict; no unjustified `any`
- [ ] Env validated at startup; no secrets in repo
- [ ] Backend: layers respected; patterns used **with clear purpose** (not gratuitous abstractions)
- [ ] Errors and HTTP status codes consistent; authz on mutating routes
- [ ] Database: **access patterns** documented or updated for schema/index/query changes; decisions **reasoned**, not arbitrary
- [ ] MongoDB queries bounded (pagination, projections); indexes match those access patterns
- [ ] New list APIs paginated; limits enforced server-side
- [ ] **OpenAPI** spec updated in the same PR as any REST route change; **Swagger UI** still accurate for dev
- [ ] UI: **tests written first** for new/changed components, then implementation
- [ ] Frontend: **Redux (RTK)** used for appropriate global state; **reusable hooks** for shared client logic; middleware used for cross-cutting dispatch-side concerns where applicable
- [ ] ESLint passes; accessibility considered for interactive UI
- [ ] `TASK_CHECKLIST.md` updated if feature-level work was scoped there

---

*Update this file when team standards evolve; version bumps help everyone stay aligned.*
