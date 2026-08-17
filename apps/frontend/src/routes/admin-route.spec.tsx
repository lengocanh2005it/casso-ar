import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { authTokenManager } from '@/lib/api-client';
import { AdminRoute } from './admin-route';

vi.mock('@/contexts/auth-context', async () => {
  const actual = await vi.importActual<
    typeof import('@/contexts/auth-context')
  >('@/contexts/auth-context');
  return { ...actual, useAuth: vi.fn() };
});

const useAuthMock = vi.mocked(useAuth);

function buildToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.`;
}

function renderAdminRoute() {
  return render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <Routes>
        <Route path="/admin/dashboard" element={<AdminRoute>ok</AdminRoute>} />
        <Route path="/admin/login" element={<div>login</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('AdminRoute', () => {
  it('renders children when the current token has isOperator=true', () => {
    useAuthMock.mockReturnValue({ isLoading: false } as never);
    authTokenManager.setAccessToken(
      buildToken({ isOperator: true, exp: Date.now() / 1000 + 3600 }),
    );

    renderAdminRoute();

    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('redirects to /admin/login when there is no operator token', () => {
    useAuthMock.mockReturnValue({ isLoading: false } as never);
    authTokenManager.setAccessToken(null);

    renderAdminRoute();

    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('waits for session restoration instead of redirecting while still loading', () => {
    useAuthMock.mockReturnValue({ isLoading: true } as never);
    authTokenManager.setAccessToken(null);

    renderAdminRoute();

    expect(screen.queryByText('login')).not.toBeInTheDocument();
    expect(screen.queryByText('ok')).not.toBeInTheDocument();
  });
});
