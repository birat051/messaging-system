import type { components } from '../../../generated/api-types';
import type { AppDispatch } from '../../../store/store';
import { setSession } from '../stores/authSlice';
import { writeRefreshToken } from './authStorage';

type AuthResponse = components['schemas']['AuthResponse'];
type User = components['schemas']['User'];
type VerifyEmailResponse = components['schemas']['VerifyEmailResponse'];

/** Call after **`POST /auth/login`**, **`POST /auth/register`**, **`POST /auth/refresh`**, etc. */
export function applyAuthResponse(
  dispatch: AppDispatch,
  data: AuthResponse,
  user: User | null,
): void {
  dispatch(setSession({ user, accessToken: data.accessToken ?? null }));
  if (data.refreshToken) {
    writeRefreshToken(data.refreshToken);
  }
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
    }),
  );
  if (data.refreshToken) {
    writeRefreshToken(data.refreshToken);
  }
}
