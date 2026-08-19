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

vi.mock('@/lib/api-client', async () => {
  const { getApiErrorCode, getApiErrorMessage } = await import(
    '@/test/api-error-mock'
  );
  return {
    authTokenManager: {
      getValidAccessToken,
      hasKnownSession: () => true,
      setAccessToken: vi.fn(),
      resetLogoutState: vi.fn(),
      markLogoutInitiated: vi.fn(),
      clearStaleRefreshSession: vi.fn(),
    },
    apiRequest,
    getApiErrorCode,
    getApiErrorMessage,
  };
});

const user = {
  id: 'user-1',
  email: 'new@casso.vn',
  name: 'New User',
  role: 'OWNER',
  organizationId: 'org-1',
  organizationName: 'Casso Ledger',
  subscriptionPlan: 'FREE',
  bankingLinked: true,
};

describe('signup and email verification', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('sends a new account to the email verification screen', async () => {
    apiRequest.mockResolvedValueOnce({
      accessToken: 'unused-before-verification',
    });

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
            <Route path="/verify-email" element={<VerifyEmailPage />} />
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
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '0101234567' },
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

    await waitFor(() =>
      expect(screen.getByText(/kiểm tra email/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(1, {
      url: '/api/v1/auth/signup',
      method: 'POST',
      data: {
        organizationName: 'Casso Ledger',
        name: 'New User',
        email: 'new@casso.vn',
        password: 'secret123',
        taxCode: '0101234567',
      },
    });
  });

  it('verifies an email token from the URL', async () => {
    apiRequest
      .mockResolvedValueOnce({ verified: true, accessToken: 'verified-token' })
      .mockResolvedValueOnce({ ...user, bankingLinked: false });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?token=verify-token']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/onboarding" element={<div>onboarding</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByText('onboarding')).toBeVisible());
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { token: 'verify-token' },
    });
  });

  it('shows a pending state when the verification link has not been opened', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/kiểm tra email/i)).toBeVisible(),
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('resends the verification email from the pending state', async () => {
    apiRequest.mockResolvedValueOnce({ success: true });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /gửi lại email/i }),
      ).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi lại email/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/auth/resend-verification',
        method: 'POST',
        data: { email: 'new@casso.vn' },
      }),
    );
  });

  it('shows a pending-review state when the organization is awaiting approval', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_PENDING_REVIEW',
          message: 'Tổ chức của bạn đang chờ được duyệt.',
        },
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?token=verify-token']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/email đã được xác minh/i)).toBeVisible(),
    );
    expect(
      screen.getByText(/tổ chức của bạn đang chờ được duyệt/i),
    ).toBeVisible();
  });

  it('shows a rejected state with the API message when the organization was rejected', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_REJECTED',
          message: 'Đăng ký tổ chức của bạn chưa được chấp thuận.',
        },
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/verify-email?token=verify-token']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/đăng ký tổ chức của bạn chưa được chấp thuận/i),
      ).toBeVisible(),
    );
  });
});
