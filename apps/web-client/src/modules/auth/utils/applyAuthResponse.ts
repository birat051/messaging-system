import type { components } from '../../../generated/api-types';
import type { AppDispatch } from '../../../store/store';
import { setSession } from '../stores/authSlice';
import { writeRefreshToken } from './authStorage';
import { syncGuestReauthPreferenceFromUser } from './guestSessionPreference';
import { logDevSessionTokenWrite } from './sessionWriteDebug';

type AuthResponse = components['schemas']['AuthResponse'];
type User = components['schemas']['User'];
type VerifyEmailResponse = components['schemas']['VerifyEmailResponse'];
type GuestAuthResponse = components['schemas']['GuestAuthResponse'];

/** Call after **`POST /auth/login`**, **`POST /auth/register`**, **`POST /auth/refresh`**, etc. */
export function applyAuthResponse(
  dispatch: AppDispatch,
  data: AuthResponse,
  user: User | null,
  sessionWriteSource = 'applyAuthResponse',
): void {
  dispatch(
    setSession({
      user,
      accessToken: data.accessToken ?? null,
      accessTokenExpiresAt: data.expiresAt ?? null,
    }),
  );
  if (data.refreshToken) {
    writeRefreshToken(data.refreshToken);
  }
  logDevSessionTokenWrite(sessionWriteSource, data.accessToken ?? null);
}

/** After **`POST /auth/guest`** — same **`auth`** slice shape as **`applyAuthResponse`** (`user`, tokens). */
export function applyGuestAuthResponse(
  dispatch: AppDispatch,
  data: GuestAuthResponse,
): void {
  dispatch(
    setSession({
      user: data.user,
      accessToken: data.accessToken,
      accessTokenExpiresAt: data.expiresAt,
    }),
  );
  if (data.refreshToken) {
    writeRefreshToken(data.refreshToken);
  }
  logDevSessionTokenWrite('auth.applyGuestAuthResponse', data.accessToken);
  syncGuestReauthPreferenceFromUser(data.user);
}

/** Call after **`POST /auth/verify-email`** — includes **`User`** with **`emailVerified: true`**. */
export function applyVerifyEmailResponse(
  dispatch: AppDispatch,
  data: VerifyEmailResponse,
): void {
  dispatch(
    setSession({
      user: data.user,
      accessToken: data.accessToken,
      accessTokenExpiresAt: null,
    }),
  );
  if (data.refreshToken) {
    writeRefreshToken(data.refreshToken);
  }
  logDevSessionTokenWrite('auth.applyVerifyEmailResponse', data.accessToken);
  syncGuestReauthPreferenceFromUser(data.user);
}
