import type { Location } from 'react-router-dom';
import { ROUTES } from './paths';

/** Passed with **`Navigate`** when sending users to **`/login`**; restored after sign-in. */
export type AuthRedirectState = {
  from?: Location;
  email?: string;
};

const AUTH_PATHS = new Set<string>([
  ROUTES.login,
  ROUTES.register,
  ROUTES.verifyEmail,
  ROUTES.guest,
]);

/**
 * Where to go after a successful login, register, or verify-email.
 * Uses **`location.state.from`** from **`ProtectedRoute`**; falls back to **`/`**.
 * **`/settings`** is never restored after auth — users land on **`/`** so the main app opens on the home/chat shell instead of profile.
 */
export function getPostLoginRedirectPath(state: unknown): string {
  const from = (state as AuthRedirectState | null)?.from;
  const path = from?.pathname;
  if (!path || AUTH_PATHS.has(path)) {
    return ROUTES.home;
  }
  if (!path.startsWith('/') || path.startsWith('//')) {
    return ROUTES.home;
  }
  if (path === ROUTES.settings) {
    return ROUTES.home;
  }
  return path;
}
