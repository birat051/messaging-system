# Redux store (`apps/web-client`)

Aligned with **`docs/PROJECT_GUIDELINES.md` §4.0** and **§4.3**.

| Concern | Where |
|--------|--------|
| **Slices** | **`src/modules/<module-id>/stores/`** — e.g. **`modules/auth/stores/`** (**`authSlice`**, **`selectors`**), **`modules/app/stores/appSlice.ts`** (minimal **`app`** root slice until more features register). |
| **Store wiring** | **`store.ts`** — **`configureStore`**, root reducer, **`.concat(...)`** middleware for cross-cutting dispatch-side work: logging, analytics, **API error normalization**. Keep middleware free of React Router / DOM; inject navigators via refs/helpers if needed. |
| **Async API** | **`createAsyncThunk`** next to the slice or in a colocated `*.thunks.ts` when it grows — not inside middleware for normal request/response flows. |
| **Tokens** | Access JWT in **Redux** (`auth.accessToken`); refresh token in **`localStorage`** (`modules/auth/utils/authStorage.ts`). **`httpClient`** interceptors handle **401** / refresh — see **`src/common/api/httpClient.ts`**. |
| **Components** | Use **`useAppDispatch`** / **`useAppSelector`** or composed hooks (**`useAuth`**, etc.) — **not** raw `useDispatch` / `useSelector`. |
