import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { ROUTES } from './paths';

/**
 * Unauthenticated users are sent to **`/login`** with **`state.from`** so they return after sign-in.
 */
export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return (
      <Navigate to={ROUTES.login} state={{ from: location }} replace />
    );
  }

  return <Outlet />;
}
