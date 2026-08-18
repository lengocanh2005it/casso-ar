import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
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

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'owner@casso.vn' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /đăng nhập/i }));
}

describe('LoginPage', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('treats login as successful even when the post-login /auth/me call fails', async () => {
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url === '/api/v1/auth/login') {
        return Promise.resolve({ accessToken: 'access-token' });
      }
      return Promise.reject(new Error('me failed'));
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible());
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText('dashboard')).toBeVisible());
    expect(
      screen.queryByText(/email hoặc mật khẩu không đúng/i),
    ).not.toBeInTheDocument();
  });

  it('shows an error when the login request itself fails', async () => {
    apiRequest.mockRejectedValue(new Error('invalid credentials'));

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByLabelText(/email/i)).toBeVisible());
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/email hoặc mật khẩu không đúng/i)).toBeVisible(),
    );
  });
});
