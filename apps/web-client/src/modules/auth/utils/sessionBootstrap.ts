import { refreshTokens } from '../../../common/api/authApi';
import { getCurrentUser } from '../../../common/api/usersApi';
import type { AppDispatch } from '../../../store/store';
import { applyAuthResponse } from './applyAuthResponse';
import { logout, setUser } from '../stores/authSlice';
import { clearRefreshToken, readRefreshToken } from './authStorage';

let inFlight: Promise<void> | null = null;

/**
 * If **`localStorage`** has a refresh token, **`POST /auth/refresh`** then **`GET /users/me`** to
 * hydrate Redux. Safe to call multiple times (single-flight). Used on app bootstrap.
 */
export function bootstrapSessionIfNeeded(dispatch: AppDispatch): Promise<void> {
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const rt = readRefreshToken();
      if (!rt) {
        return;
      }
      const data = await refreshTokens({ refreshToken: rt });
      applyAuthResponse(dispatch, data, null);
      try {
        const user = await getCurrentUser();
        dispatch(setUser(user));
      } catch {
        clearRefreshToken();
        dispatch(logout());
      }
    } catch {
      clearRefreshToken();
      dispatch(logout());
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
