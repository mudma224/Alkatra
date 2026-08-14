import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from './ProtectedRoute';
import { useAuthStore } from '../store/authStore';

function renderWithRouter() {
  return render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Dashboard Page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

const mockUser = {
  id: '1',
  phone: '+212612345678',
  name: null,
  preferredLanguage: 'french' as const,
  createdAt: new Date().toISOString(),
};

describe('ProtectedRoute', () => {
  beforeEach(() => {
    useAuthStore.getState().clearSession();
  });

  it('redirects to /login when not authenticated', () => {
    renderWithRouter();
    expect(screen.getByText('Login Page')).toBeInTheDocument();
  });

  it('renders children when authenticated', () => {
    useAuthStore.getState().setSession({ accessToken: 'a', refreshToken: 'r', user: mockUser });
    renderWithRouter();
    expect(screen.getByText('Dashboard Page')).toBeInTheDocument();
  });
});