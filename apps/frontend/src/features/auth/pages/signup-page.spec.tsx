import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { SignupPage } from './signup-page';

const { getValidAccessToken, apiRequest } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  authTokenManager: {
    getValidAccessToken,
    hasKnownSession: () => true,
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
  apiRequest,
}));

function fillAndSubmit() {
  fireEvent.change(screen.getByLabelText(/tên tổ chức/i), {
    target: { value: 'Casso Ledger' },
  });
  fireEvent.change(screen.getByLabelText(/họ và tên/i), {
    target: { value: 'New User' },
  });
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: 'new@casso.vn' },
  });
  fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
    target: { value: 'secret123' },
  });
  fireEvent.click(screen.getByRole('button', { name: /tạo tài khoản/i }));
}

describe('SignupPage', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('treats signup as successful even when the post-signup /auth/me call fails', async () => {
    apiRequest.mockImplementation((config: { url: string }) => {
      if (config.url === '/api/v1/auth/signup') {
        return Promise.resolve({ accessToken: 'access-token' });
      }
      return Promise.reject(new Error('me failed'));
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() => expect(screen.getByText('dashboard')).toBeVisible());
    expect(
      screen.queryByText(/không thể tạo tài khoản/i),
    ).not.toBeInTheDocument();
  });

  it('shows an error when the signup request itself fails', async () => {
    apiRequest.mockRejectedValue(new Error('signup failed'));

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/không thể tạo tài khoản/i)).toBeVisible(),
    );
  });
});
