import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResult, AuthUser } from '../types/auth.types';

/**
 * Shape of the persisted authentication state.
 * `expiresAt` is an ISO timestamp computed from `expiresIn` (seconds)
 * returned by the backend at login/refresh time.
 */
interface AuthState {
  phone: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  user: AuthUser | null;
  setAuth: (payload: AuthResult) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

const STORAGE_KEY = 'alkatra-auth';

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      phone: null,
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
      user: null,

      /**
       * Stores the authentication result returned by the backend
       * (verify-otp or refresh). Computes the absolute expiration
       * timestamp from the relative `expiresIn` (seconds).
       */
      setAuth: (payload: AuthResult) => {
        const expiresAt = new Date(
          Date.now() + payload.expiresIn * 1000,
        ).toISOString();

        set({
          phone: payload.user.phone,
          accessToken: payload.accessToken,
          refreshToken: payload.refreshToken,
          expiresAt,
          user: payload.user,
        });
      },

      /**
       * Clears the whole authentication state.
       */
      clearAuth: () => {
        set({
          phone: null,
          accessToken: null,
          refreshToken: null,
          expiresAt: null,
          user: null,
        });
      },

      /**
       * Returns true when a non-expired access token is present.
       */
      isAuthenticated: () => {
        const { accessToken, expiresAt } = get();

        if (!accessToken || !expiresAt) {
          return false;
        }

        return new Date(expiresAt).getTime() > Date.now();
      },
    }),
    {
      name: STORAGE_KEY,
    },
  ),
);