import { create } from 'zustand';
import type { AuthResult, AuthUser } from '../types/auth.types';

/**
 * Authentication state kept only in application memory.
 *
 * Security note:
 * Access and refresh tokens are intentionally NOT persisted in
 * localStorage/sessionStorage because both are readable by JavaScript.
 *
 * A future persistent session requires a backend-issued HttpOnly,
 * Secure and SameSite cookie. This frontend must not invent that contract.
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

export const useAuthStore = create<AuthState>()((set, get) => ({
  // Tokens exist only in memory and disappear when the page is reloaded.
  phone: null,
  accessToken: null,
  refreshToken: null,
  expiresAt: null,
  user: null,

  /**
   * Stores the authentication result returned by verify-otp or refresh.
   *
   * The expiration timestamp is calculated locally only to determine
   * whether the current access token can still be used.
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
   * Updates the authenticated user's profile without touching tokens.
   */
  updateUser: (user: AuthUser) => {
    set({
      user,
      phone: user.phone,
    });
  },

  /**
   * Clears every authentication value from memory.
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
   * Allows protected routes to check whether the in-memory access token
   * exists and has not expired.
   */
  isAuthenticated: () => {
    const { accessToken, expiresAt } = get();

    if (!accessToken || !expiresAt) {
      return false;
    }

    return new Date(expiresAt).getTime() > Date.now();
  },
}));