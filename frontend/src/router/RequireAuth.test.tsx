import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, beforeEach } from 'vitest';
import { RequireAuth } from './RequireAuth';
import { useAuthStore } from '../store/auth.store';
import type { AuthResult } from '../types/auth.types';

function makeAuthResult(): AuthResult {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 3600,
    tokenType: 'Bearer',
    user: {
      id: 'user-1',
      phone: '+212617503677',
      createdAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

function renderProtectedRoute(initialPath = '/farms') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={<div>Login page</div>} />
        <Route element={<RequireAuth />}>
          <Route path="/farms" element={<div>Farms page</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.getState().clearAuth();
  });

  it('redirects to /login when the user is not authenticated', () => {
    renderProtectedRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Farms page')).not.toBeInTheDocument();
  });

  it('renders the protected children when the user is authenticated', () => {
    useAuthStore.getState().setAuth(makeAuthResult());

    renderProtectedRoute();

    expect(screen.getByText('Farms page')).toBeInTheDocument();
    expect(screen.queryByText('Login page')).not.toBeInTheDocument();
  });

  it('redirects to /login when the token is expired', () => {
    useAuthStore.getState().setAuth({
      ...makeAuthResult(),
      expiresIn: -10,
    });

    renderProtectedRoute();

    expect(screen.getByText('Login page')).toBeInTheDocument();
    expect(screen.queryByText('Farms page')).not.toBeInTheDocument();
  });
});