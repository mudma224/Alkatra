import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResult, AuthUser } from '../types/auth.types';
import type { PersistOptions } from 'zustand/middleware';

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
  updateUser: (user: AuthUser) => void;
  clearAuth: () => void;
  isAuthenticated: () => boolean;
}

const STORAGE_KEY = 'alkatra-auth';

/**
 * Custom merge for the `persist` middleware.
 *
 * The default shallow merge (`{ ...currentState, ...persistedState }`) can
 * overwrite the store's functions (setAuth, clearAuth, isAuthenticated) if
 * the persisted state in localStorage contains a key with the same name
 * (e.g. a stale `isAuthenticated` boolean from an older version or corrupted data).
 *
 * This merge only restores the expected data fields and ALWAYS keeps the
 * functions/actions defined by the store creator.
 */
const persistOptions: PersistOptions<AuthState> = {
  name: STORAGE_KEY,
  merge: (persistedState, currentState) => {
    const persisted = persistedState as Partial<AuthState> | undefined;

    return {
      ...currentState,
      phone: persisted?.phone ?? currentState.phone,
      accessToken: persisted?.accessToken ?? currentState.accessToken,
      refreshToken: persisted?.refreshToken ?? currentState.refreshToken,
      expiresAt: persisted?.expiresAt ?? currentState.expiresAt,
      user: persisted?.user ?? currentState.user,
    };
  },
};

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
       * Updates the currently authenticated user's profile.
       */
      updateUser: (user: AuthUser) => {
        set({
          user,
          phone: user.phone,
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
    persistOptions,
  ),
);