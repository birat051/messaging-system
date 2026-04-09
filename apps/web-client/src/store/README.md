# Redux store (`apps/web-client`)

Aligned with **`docs/PROJECT_GUIDELINES.md` §4.3**.

| Concern | Where |
|--------|--------|
| **Slices** | `src/features/<feature>/` — `createSlice` for that domain (e.g. **`auth`**). |
| **Async API** | **`createAsyncThunk`** next to the slice or in a colocated `*.thunks.ts` when it grows — not inside middleware for normal request/response flows. |
| **Middleware** | **`store.ts`** — extend with **`.concat(...)`** for cross-cutting dispatch-side work: logging, analytics, **API error normalization**. Keep middleware free of React Router / DOM; inject navigators via refs/helpers if needed. |
| **Tokens** | Access JWT in **Redux** (`auth.accessToken`); refresh token in **`localStorage`** (`authStorage.ts`). **`httpClient`** interceptors handle **401** / refresh — see **`src/api/httpClient.ts`**. |
| **Components** | Use **`useAppDispatch`** / **`useAppSelector`** or composed hooks (**`useAuth`**, etc.) — **not** raw `useDispatch` / `useSelector`. |
