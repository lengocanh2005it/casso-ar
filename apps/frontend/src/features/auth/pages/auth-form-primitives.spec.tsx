import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { ForgotPasswordPage } from './forgot-password-page';
import { InviteAcceptPage } from './invite-accept-page';
import { LoginPage } from './login-page';
import { ResetPasswordPage } from './reset-password-page';
import { SignupPage } from './signup-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const { getApiErrorCode, getApiErrorMessage } = await import(
    '@/test/api-error-mock'
  );
  return {
    authTokenManager: {
      getValidAccessToken: vi.fn().mockResolvedValue(null),
      hasKnownSession: () => false,
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

// Every guest-route form must use the shared Input so field height, border and
// focus ring match the rest of the app instead of drifting per page.
function renderInRouter(element: React.ReactElement, path: string) {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>
    </AuthProvider>,
  );
}

describe('auth pages use the shared form primitives', () => {
  it('exposes the auth surface as a main landmark for screen readers', () => {
    renderInRouter(<LoginPage />, '/login');

    expect(screen.getByRole('main')).toBe(screen.getByTestId('auth-surface'));
  });

  it('login renders shared Inputs for email and password', () => {
    renderInRouter(<LoginPage />, '/login');

    expect(screen.getByLabelText(/email/i)).toHaveAttribute(
      'data-slot',
      'input',
    );
    expect(screen.getByLabelText(/mật khẩu/i)).toHaveAttribute(
      'data-slot',
      'input',
    );
  });

  it('forgot password renders a shared Input', () => {
    renderInRouter(<ForgotPasswordPage />, '/forgot-password');

    expect(screen.getByLabelText(/email/i)).toHaveAttribute(
      'data-slot',
      'input',
    );
  });

  it('reset password renders a shared Input', () => {
    renderInRouter(<ResetPasswordPage />, '/reset-password?token=abc');

    expect(screen.getByLabelText(/mật khẩu mới/i)).toHaveAttribute(
      'data-slot',
      'input',
    );
  });

  it('invite accept renders shared Inputs', () => {
    renderInRouter(<InviteAcceptPage />, '/invite-accept?token=abc');

    expect(screen.getByLabelText(/họ và tên/i)).toHaveAttribute(
      'data-slot',
      'input',
    );
    expect(screen.getByLabelText(/mật khẩu/i)).toHaveAttribute(
      'data-slot',
      'input',
    );
  });

  it('signup renders a shared Input for the tax code step', () => {
    renderInRouter(<SignupPage />, '/signup');

    expect(screen.getByLabelText(/mã số thuế/i)).toHaveAttribute(
      'data-slot',
      'input',
    );
  });

  it('signup renders shared Inputs on the account details step', async () => {
    renderInRouter(<SignupPage />, '/signup');

    // A tax code that resolves to no organization skips the confirm step and
    // lands on the form, so this covers the 4 inputs the tax-code step lacks.
    apiRequest.mockRejectedValue(new Error('lookup unavailable'));
    fireEvent.change(screen.getByLabelText(/mã số thuế/i), {
      target: { value: '0101234567' },
    });
    fireEvent.click(screen.getByRole('button', { name: /tiếp tục/i }));

    await screen.findByLabelText(/tên tổ chức/i);

    for (const label of [/tên tổ chức/i, /họ và tên/i, /email/i, /mật khẩu/i]) {
      expect(screen.getByLabelText(label)).toHaveAttribute(
        'data-slot',
        'input',
      );
    }
  });
});
