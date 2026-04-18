/** Central route paths for navigation and redirects (e.g. after **401**). */
export const ROUTES = {
  home: '/',
  settings: '/settings',
  login: '/login',
  register: '/register',
  verifyEmail: '/verify-email',
  /** Guest sandbox entry — username for **`POST /auth/guest`**; also used when the guest session expires (**401**). */
  guest: '/guest',
} as const;
