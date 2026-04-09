import { useCallback } from 'react';
import { clearRefreshToken } from '../features/auth/authStorage';
import { logout } from '../features/auth/authSlice';
import {
  selectAccessToken,
  selectAuthUser,
  selectEmailVerified,
  selectIsAuthenticated,
} from '../features/auth/selectors';
import { useAppDispatch, useAppSelector } from '../store/hooks';

/**
 * Composed auth state + **`logout`** for components and other hooks (`PROJECT_GUIDELINES.md` §4.3).
 * Login/register flows should use **`applyAuthResponse`** (`features/auth/applyAuthResponse.ts`) so refresh token is persisted.
 */
export function useAuth() {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectAuthUser);
  const accessToken = useAppSelector(selectAccessToken);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const emailVerified = useAppSelector(selectEmailVerified);

  const signOut = useCallback(() => {
    clearRefreshToken();
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
