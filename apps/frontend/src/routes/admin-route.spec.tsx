import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { authTokenManager } from '@/lib/api-client';
import { AdminRoute } from './admin-route';

function buildToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.`;
}

describe('AdminRoute', () => {
  it('renders children when the current token has isOperator=true', () => {
    authTokenManager.setAccessToken(
      buildToken({ isOperator: true, exp: Date.now() / 1000 + 3600 }),
    );

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={<AdminRoute>ok</AdminRoute>}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('redirects to /admin/login when there is no operator token', () => {
    authTokenManager.setAccessToken(null);

    render(
      <MemoryRouter initialEntries={['/admin/dashboard']}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={<AdminRoute>ok</AdminRoute>}
          />
          <Route path="/admin/login" element={<div>login</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('login')).toBeInTheDocument();
  });
});
