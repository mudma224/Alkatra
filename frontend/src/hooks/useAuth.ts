import { useCallback } from 'react';
import { useAuthStore } from '../store/auth.store';
import type { AuthResult } from '../types/auth.types';

/**
 * Convenience hook on top of the auth store, so components and screens
 * never depend on the store's shape directly (easier to test/migrate).
 */
export function useAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const setAuth = useAuthStore((state) => state.setAuth);
  const clearAuth = useAuthStore((state) => state.clearAuth);

  const completeLogin = useCallback(
    (result: AuthResult) => {
      setAuth(result);
    },
    [setAuth],
  );

  const logout = useCallback(() => {
    clearAuth();
  }, [clearAuth]);

  return { accessToken, user, isAuthenticated, completeLogin, logout };
}
