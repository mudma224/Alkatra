import { useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import type { VerifyOtpResponse } from '../types/auth.types';

export function useAuth() {
  const accessToken = useAuthStore((state) => state.accessToken);
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const setSession = useAuthStore((state) => state.setSession);
  const clearSession = useAuthStore((state) => state.clearSession);

  const completeLogin = useCallback(
    (response: VerifyOtpResponse) => {
      setSession({
        accessToken: response.accessToken,
        refreshToken: response.refreshToken,
        user: response.user,
      });
    },
    [setSession],
  );

  const logout = useCallback(() => {
    clearSession();
  }, [clearSession]);

  return { accessToken, user, isAuthenticated, completeLogin, logout };
}