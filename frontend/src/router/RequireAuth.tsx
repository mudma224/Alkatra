import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';

/**
 * Route guard that protects authenticated routes.
 *
 * - If the user is not authenticated → redirect to /login.
 * - If the user is authenticated → render the nested routes (<Outlet />).
 */
export function RequireAuth() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}