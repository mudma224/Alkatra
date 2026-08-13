import { describe, expect, it, beforeEach } from 'vitest';
import { useAuthStore } from './auth.store';
import type { AuthResult } from '../types/auth.types';

const STORAGE_KEY = 'alkatra-auth';

function makeAuthResult(overrides: Partial<AuthResult> = {}): AuthResult {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    user: {
      id: 'user-1',
      phone: '+212617503677',
      name: null,
      preferredLanguage: 'french',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    ...overrides,
  };
}

describe('auth.store', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearAuth();
  });

  it('setAuth stores the authentication payload and computes expiresAt', () => {
    const result = makeAuthResult({ expiresIn: 3600 });

    useAuthStore.getState().setAuth(result);

    const state = useAuthStore.getState();

    expect(state.accessToken).toBe('access-token');
    expect(state.refreshToken).toBe('refresh-token');
    expect(state.phone).toBe('+212617503677');
    expect(state.user).toEqual(result.user);
    expect(state.expiresAt).toBeTruthy();

    const expiresAt = new Date(state.expiresAt as string).getTime();
    const now = Date.now();
    expect(expiresAt).toBeGreaterThan(now);
    expect(expiresAt).toBeLessThanOrEqual(now + 3600 * 1000);
  });

  it('clearAuth empties the whole authentication state', () => {
    useAuthStore.getState().setAuth(makeAuthResult());

    useAuthStore.getState().clearAuth();

    const state = useAuthStore.getState();
    expect(state.accessToken).toBeNull();
    expect(state.refreshToken).toBeNull();
    expect(state.phone).toBeNull();
    expect(state.expiresAt).toBeNull();
    expect(state.user).toBeNull();
  });

  it('isAuthenticated returns false when no token is present', () => {
    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns true when a non-expired token is present', () => {
    useAuthStore.getState().setAuth(makeAuthResult({ expiresIn: 3600 }));

    expect(useAuthStore.getState().isAuthenticated()).toBe(true);
  });

  it('isAuthenticated returns false when the token is expired', () => {
    useAuthStore.getState().setAuth(
      makeAuthResult({
        expiresIn: -10,
      }),
    );

    expect(useAuthStore.getState().isAuthenticated()).toBe(false);
  });

  it('persists the state to localStorage under the alkatra-auth key', () => {
    useAuthStore.getState().setAuth(makeAuthResult());

    const raw = localStorage.getItem(STORAGE_KEY);
    expect(raw).toBeTruthy();

    const persisted = JSON.parse(raw as string);
    expect(persisted.state.accessToken).toBe('access-token');
    expect(persisted.state.phone).toBe('+212617503677');
  });
});