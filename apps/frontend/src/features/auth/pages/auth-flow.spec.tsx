import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { GuestRoute, ProtectedRoute } from '@/routes/protected-route';
import { LoginPage } from './login-page';

const { getValidAccessToken, apiRequest } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  authTokenManager: {
    getValidAccessToken,
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
  apiRequest,
}));

const user = {
  id: 'user-1',
  email: 'owner@casso.vn',
  name: 'Owner',
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Casso Ledger',
  subscriptionPlan: 'FREE',
  bankingLinked: true,
};

describe('authentication routes', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('logs in and redirects to the dashboard', async () => {
    apiRequest
      .mockResolvedValueOnce({ accessToken: 'access-token' })
      .mockResolvedValueOnce(user);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginPage />
                </GuestRoute>
              }
            />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible());
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('name', 'email');
    expect(screen.getByLabelText(/mật khẩu/i)).toHaveAttribute(
      'name',
      'password',
    );
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'owner@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));

    await waitFor(() => expect(screen.getByText('dashboard')).toBeVisible());
  });

  it('shows a spinner while login is pending', async () => {
    apiRequest.mockImplementation(() => new Promise(() => {}));

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible());
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'owner@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'secret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));

    const button = await screen.findByRole('button', {
      name: /đang xử lý/i,
    });
    expect(button.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
  });

  it('shows an inline, focused error when login fails', async () => {
    apiRequest.mockRejectedValueOnce(new Error('invalid credentials'));

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginPage />
                </GuestRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible());
    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'owner@casso.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'wrong' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Email hoặc mật khẩu không đúng.');
    await waitFor(() => expect(alert).toHaveFocus());
  });

  it('redirects unauthenticated users from protected routes to login', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Routes>
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <div>dashboard</div>
                </ProtectedRoute>
              }
            />
            <Route
              path="/login"
              element={
                <GuestRoute>
                  <LoginPage />
                </GuestRoute>
              }
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeVisible(),
    );
  });
});
