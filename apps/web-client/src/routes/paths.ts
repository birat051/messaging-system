/** Central route paths for navigation and redirects (e.g. after **401**). */
export const ROUTES = {
  home: '/',
  settings: '/settings',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  /** Guest sandbox entry — username for **`POST /auth/guest`**; also used when the guest session expires (**401**). */
  guest: '/guest',
  /** Public legal page — MVP placeholder copy until counsel-approved text is supplied. */
  privacy: '/privacy',
  terms: '/terms',
} as const;

/**
 * Query flag for **`/register`** opened from an active guest session — stable across refresh and
 * independent of **`location.state`** (avoids losing intent on navigate / remount).
 */
export const REGISTER_FROM_GUEST_QUERY_KEY = 'from';
export const REGISTER_FROM_GUEST_QUERY_VALUE = 'guest';

export function registerPathFromGuest(): string {
  return `${ROUTES.register}?${REGISTER_FROM_GUEST_QUERY_KEY}=${REGISTER_FROM_GUEST_QUERY_VALUE}`;
}
