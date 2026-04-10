# REST client API boundary

All **HTTP** traffic to **messaging-service** is centralized here (**`src/common/api/`**). **`PROJECT_GUIDELINES.md` §4.0** and **`TASK_CHECKLIST.md`** (web-client — REST mocking) require UI code to depend on these modules so tests can mock **`httpClient`** or a single API module (e.g. **`usersApi`**) without ad-hoc URLs.

## Rules

1. **Pages, components, hooks** import **`authApi`**, **`usersApi`**, **`API_PATHS`**, **`swrFetcher`**, **`swrConfigValue`**, or the **[`index.ts`](./index.ts) barrel** — not **`httpClient`** / **`httpMutations`** directly (ESLint **`no-restricted-imports`**).
2. **Paths** — use **`API_PATHS`** from [`paths.ts`](./paths.ts); they are relative to **`httpClient` `baseURL`** (includes **`/v1`**).
3. **Socket URLs** — [`getSocketUrl`](../utils/apiConfig.ts) / [`getApiBaseUrl`](../utils/apiConfig.ts) live in **`common/utils/`** (Vite env + display; **not** REST resource URLs).
4. **Tests** (behaviour-focused RTL + Vitest; avoid **`fetch`** stubs — use Axios mocks or MSW):
   - **`vi.mock` must use the same module specifier as the component under test** — prefer **`@/common/api/...`** (matches **`vite.config.ts`** / **`tsconfig`** aliases) so mocks align with **`import`** in **`*.tsx`**.
   - **`vi.mock('@/common/api/httpClient')`** — when the code under test imports **`httpClient`** (usually only from **`common/api/*`** modules, not pages).
   - **`vi.mock('@/common/api/usersApi')`** (or another `*Api`) — assert the exported function was called and **UI / Redux** state matches (**`SettingsPage.usersApiMock.test.tsx`**).
   - **MSW** — integration-style; **`server.use`** per test for **401**, **4xx**, **empty lists** — **`src/common/integration/msw.integration.test.tsx`** (with **`findByText`** / **`waitFor`**); default handlers in **`SettingsPage.test.tsx`**.
   - Prefer **user-visible assertions** and **resolved state**; do not assert React internals.

## Layout

| Module | Role |
|--------|------|
| [`httpClient.ts`](./httpClient.ts) | Shared Axios instance + **`attachHttpAuth`** (only **`main.tsx`** wires interceptors). **429** is rejected immediately (no token refresh, no interceptor retry); shows a **`warning`** toast via **`toastBridge`** when **`ToastProvider`** is mounted. Use **`parseApiError`** / **`getApiErrorMessage`** for inline errors; **`isRateLimitedError`** avoids duplicate **`toast.error`** in **`catch`**. |
| [`paths.ts`](./paths.ts) | **`API_PATHS`** — single source of path strings. |
| `*Api.ts` | One file per area (`auth`, `users`, `messages`, …). |
