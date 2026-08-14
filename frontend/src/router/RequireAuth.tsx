import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

/**
 * Route guard that protects authenticated routes.
 *
 * - If the user is not authenticated → redirect to /login, remembering
 *   the attempted location so the login flow can send the user back.
 * - If the user is authenticated → render the nested routes (<Outlet />).
 */
export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}