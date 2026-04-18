import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../common/hooks/useAuth';
import { ROUTES } from './paths';

/**
 * Wraps routes that need a **full** account (not **guest**): profile/settings, etc.
 * Guests are sent to **home** so they cannot open **`/settings`** by URL.
 */
export function RegisteredOnlyRoute() {
  const { user } = useAuth();
  const location = useLocation();

  if (user?.guest) {
    return <Navigate to={ROUTES.home} replace state={{ from: location }} />;
  }

  return <Outlet />;
}
