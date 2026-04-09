import type { NavigateFunction } from 'react-router-dom';
import { ROUTES } from './paths';

let navigateFn: NavigateFunction | null = null;

/** Call once from **`App`** (inside **`BrowserRouter`**) with **`useNavigate()`**. */
export function setNavigateHandler(fn: NavigateFunction): void {
  navigateFn = fn;
}

export function navigateToLogin(): void {
  navigateFn?.(ROUTES.login, { replace: true });
}
