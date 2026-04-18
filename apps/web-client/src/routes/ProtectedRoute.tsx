import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../common/hooks/useAuth';
import { shouldPreferGuestReauth } from '../modules/auth/utils/guestSessionPreference';
import { ROUTES } from './paths';

/**
 * Unauthenticated users are sent to **`/login`** (or **`/guest`** when a prior guest session ended and
 * **`sessionStorage`** indicates guest re-auth — see **`guestSessionPreference.ts`**).
 * Nested **`RegisteredOnlyRoute`** blocks **`/settings`** for **guest** sessions (profile requires a full account).
 */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    const to = shouldPreferGuestReauth() ? ROUTES.guest : ROUTES.login;
    return <Navigate to={to} state={{ from: location }} replace />;
  }

  return <Outlet />;
}
