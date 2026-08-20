import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { SignupPage } from './signup-page';

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

function fillAndSubmit() {
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
}

describe('SignupPage', () => {
  beforeEach(() => {
    getValidAccessToken.mockReset();
    apiRequest.mockReset();
    getValidAccessToken.mockResolvedValue(null);
  });

  it('sends the new account to the OTP step inline', async () => {
    apiRequest.mockResolvedValueOnce({
      userId: 'user-1',
      organizationId: 'org-1',
      organizationStatus: 'PENDING_REVIEW',
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/new\*\*\*@casso\.vn/i)).toBeVisible(),
    );
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

  it('shows the backend message when the tax code is already registered', async () => {
    apiRequest.mockRejectedValue({
      response: {
        status: 409,
        data: {
          statusCode: 409,
          errorCode: 'CONFLICT',
          message: 'Mã số thuế này đã được đăng ký.',
          details: { rowErrorCode: 'DUPLICATE_TAX_CODE' },
        },
      },
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByLabelText(/tên tổ chức/i)).toBeVisible(),
    );
    fillAndSubmit();

    await waitFor(() =>
      expect(screen.getByText(/mã số thuế này đã được đăng ký/i)).toBeVisible(),
    );
  });

  it('rejects a malformed tax code before submitting', async () => {
    apiRequest.mockResolvedValue({
      userId: 'u1',
      organizationId: 'o1',
      organizationStatus: 'ACTIVE',
    });

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/signup']}>
          <Routes>
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/verify-email" element={<div>verify email</div>} />
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
      target: { value: '123' },
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
      expect(
        screen.getByText(/mã số thuế phải gồm 10 hoặc 13 chữ số/i),
      ).toBeVisible(),
    );
    expect(apiRequest).not.toHaveBeenCalled();
  });
});
