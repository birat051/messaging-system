import { useCallback } from 'react';
import { logout as requestServerLogout } from '../api/authApi';
import {
  clearRefreshToken,
  readRefreshToken,
} from '../../modules/auth/utils/authStorage';
import { clearGuestReauthPreference } from '../../modules/auth/utils/guestSessionPreference';
import { logout } from '../../modules/auth/stores/authSlice';
import {
  selectAccessToken,
  selectAuthUser,
  selectEmailVerified,
  selectIsAuthenticated,
} from '../../modules/auth/stores/selectors';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { store } from '../../store/store';
import { revokeCurrentDeviceOnServerBeforeLogout } from './logoutDeviceRevocation';

/**
 * Composed auth state + **`logout`** for components and other hooks (`docs/PROJECT_PLAN.md` §14.4.3).
 * Login/register flows should use **`applyAuthResponse`** (`modules/auth/utils/applyAuthResponse.ts`) so refresh token is persisted.
 *
 * **Server logout:** **`POST /v1/auth/logout`** with the stored refresh token (best-effort), then clear storage.
 *
 * **Device lifecycle:** when **`VITE_REVOKE_DEVICE_ON_LOGOUT=true`**, sign-out calls
 * **`DELETE /v1/users/me/devices/:deviceId`** before clearing the session (see **`logoutDeviceRevocation.ts`**).
 * Private keys stay in **IndexedDB** for recovery / re-registration.
 */
export function useAuth() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectAuthUser);
  const accessToken = useAppSelector(selectAccessToken);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const emailVerified = useAppSelector(selectEmailVerified);

  const signOut = useCallback(async () => {
    await revokeCurrentDeviceOnServerBeforeLogout(() => store.getState());
    const rt = readRefreshToken();
    if (rt) {
      try {
        await requestServerLogout({ refreshToken: rt });
      } catch {
        /* Clear local session even if revoke failed (offline, expired token, etc.). */
      }
    }
    clearRefreshToken();
    clearGuestReauthPreference();
    dispatch(logout());
  }, [dispatch]);

  return {
    user,
    accessToken,
    isAuthenticated,
    emailVerified,
    logout: signOut,
  };
}
