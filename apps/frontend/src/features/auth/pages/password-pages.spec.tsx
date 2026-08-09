import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForgotPasswordPage } from './forgot-password-page';
import { ResetPasswordPage } from './reset-password-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({ apiRequest }));

describe('password recovery pages', () => {
  beforeEach(() => {
    apiRequest.mockReset();
  });

  it('shows the same forgot-password confirmation for every email', async () => {
    apiRequest.mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/email/i), {
      target: { value: 'unknown@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /gửi liên kết/i }));

    await waitFor(() =>
      expect(screen.getByText(/nếu email tồn tại/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/auth/forgot-password',
      method: 'POST',
      data: { email: 'unknown@example.com' },
    });
  });

  it('resets the password with the token from the URL', async () => {
    apiRequest.mockResolvedValue({ success: true });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=reset-token']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/mật khẩu mới/i), {
      target: { value: 'newsecret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đặt lại mật khẩu/i }));

    await waitFor(() =>
      expect(screen.getByText(/mật khẩu đã được đặt lại/i)).toBeVisible(),
    );
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/auth/reset-password',
      method: 'POST',
      data: { token: 'reset-token', newPassword: 'newsecret123' },
    });
  });
});
