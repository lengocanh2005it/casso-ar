import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { GuestRoute } from '@/routes/protected-route';
import { SignupPage } from './signup-page';
import { VerifyEmailPage } from './verify-email-page';

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
  email: 'new@casso.vn',
  name: 'New User',
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Casso Ledger',
  subscriptionPlan: 'FREE',
};

describe('signup and email verification', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('creates an account and hydrates the new session', async () => {
    apiRequest
      .mockResolvedValueOnce({ accessToken: 'access-token' })
      .mockResolvedValueOnce(user);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route
              path="/signup"
              element={
                <GuestRoute>
                  <SignupPage />
                </GuestRoute>
              }
            />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
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

    await waitFor(() => expect(screen.getByText('dashboard')).toBeVisible());
    expect(apiRequest).toHaveBeenNthCalledWith(1, {
      url: '/api/v1/auth/signup',
      method: 'POST',
      data: {
        organizationName: 'Casso Ledger',
        name: 'New User',
        email: 'new@casso.vn',
        password: 'secret123',
      },
    });
  });

  it('verifies an email token from the URL', async () => {
    apiRequest.mockResolvedValue({ verified: true });

    render(
      <MemoryRouter initialEntries={['/verify-email?token=verify-token']}>
        <Routes>
          <Route path="/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText(/email đã được xác minh/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { token: 'verify-token' },
    });
  });
});
