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

function fillOtp(code: string) {
  const boxes = screen.getAllByRole('textbox');
  code.split('').forEach((digit, i) => {
    fireEvent.change(boxes[i], { target: { value: digit } });
  });
}

describe('signup and email verification', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('shows the OTP step inline after signup, without navigating away', async () => {
    apiRequest.mockResolvedValueOnce({ name: 'Casso Ledger' });
    apiRequest.mockResolvedValueOnce({
      userId: 'user-1',
      organizationId: 'org-1',
      organizationStatus: 'PENDING_REVIEW',
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
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '0101234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
      ).toBeVisible(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/họ và tên/i)).toBeVisible(),
    );
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
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenNthCalledWith(2, {
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

  it('confirms the OTP inline and lands on onboarding', async () => {
    apiRequest
      .mockResolvedValueOnce({ name: 'Casso Ledger' })
      .mockResolvedValueOnce({
        userId: 'user-1',
        organizationId: 'org-1',
        organizationStatus: 'ACTIVE',
      })
      .mockResolvedValueOnce({ verified: true, accessToken: 'access-token' })
      .mockResolvedValueOnce({ ...user, bankingLinked: false });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/onboarding" element={<div>onboarding</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/mã số thuế/i)).toBeVisible(),
    );
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '0101234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
      ).toBeVisible(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: /đúng, đây là tổ chức của tôi/i }),
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/họ và tên/i)).toBeVisible(),
    );
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
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() => expect(screen.getByText('onboarding')).toBeVisible());
    expect(apiRequest).toHaveBeenNthCalledWith(3, {
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { email: 'new@casso.vn', otp: '482913' },
    });
  });

  it('shows the OTP fallback screen from a query-param email, with no editable email input', async () => {
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
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('resends the code from the fallback screen', async () => {
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
      expect(screen.getByRole('button', { name: /gửi lại mã/i })).toBeVisible(),
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi lại mã/i }));

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
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

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
        <MemoryRouter initialEntries={['/verify-email?email=new@casso.vn']}>
          <Routes>
            <Route path="/verify-email" element={<VerifyEmailPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/đăng ký tổ chức của bạn chưa được chấp thuận/i),
      ).toBeVisible(),
    );
  });
});
