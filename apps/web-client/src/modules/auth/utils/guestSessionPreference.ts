import type { components } from '../../../generated/api-types';

type User = components['schemas']['User'];

const KEY = 'messaging-prefer-guest-reauth';

/** After a successful guest sign-in, prefer redirecting to **`ROUTES.guest`** when the session ends (expired refresh, etc.). */
export function setGuestReauthPreference(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {
    /* private / disabled storage */
  }
}

export function clearGuestReauthPreference(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function shouldPreferGuestReauth(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

/** Call whenever **`User`** is known (login, bootstrap, profile update). */
export function syncGuestReauthPreferenceFromUser(user: User | null): void {
  if (user?.guest === true) {
    setGuestReauthPreference();
  } else if (user && user.guest === false) {
    clearGuestReauthPreference();
  }
}
