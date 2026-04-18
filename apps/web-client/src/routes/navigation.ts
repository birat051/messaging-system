import type { NavigateFunction } from 'react-router-dom';
import { ROUTES } from './paths';

let navigateFn: NavigateFunction | null = null;

type PendingNav = { to: string; replace: boolean };

let pending: PendingNav | null = null;

function flushPending(fn: NavigateFunction): void {
  if (pending) {
    const p = pending;
    pending = null;
    fn(p.to, { replace: p.replace });
  }
}

/** Call once from **`App`** (inside **`BrowserRouter`**) with **`useNavigate()`**. */
export function setNavigateHandler(fn: NavigateFunction): void {
  navigateFn = fn;
  flushPending(fn);
}

function enqueueOrNavigate(to: string, replace: boolean): void {
  if (navigateFn) {
    navigateFn(to, { replace });
    return;
  }
  pending = { to, replace };
}

export function navigateToLogin(): void {
  enqueueOrNavigate(ROUTES.login, true);
}

/** After guest session expiry (**401** / failed refresh) or bootstrap failure while guest preference is set. */
export function navigateToGuestEntry(): void {
  enqueueOrNavigate(ROUTES.guest, true);
}
