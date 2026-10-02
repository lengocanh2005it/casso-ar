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

  it('offers a way to request a new link when the token is rejected', async () => {
    apiRequest.mockRejectedValue({ response: { data: {} } });

    render(
      <MemoryRouter initialEntries={['/reset-password?token=expired-token']}>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/mật khẩu mới/i), {
      target: { value: 'newsecret123' },
    });
    fireEvent.click(screen.getByRole('button', { name: /đặt lại mật khẩu/i }));

    // A rejected link must not leave the user stuck on a form that cannot
    // succeed — they need a route back to request another one.
    await waitFor(() =>
      expect(
        screen.getByText(/liên kết đã hết hạn hoặc không hợp lệ/i),
      ).toBeVisible(),
    );
    const escapeHatch = screen.getByRole('link', {
      name: /yêu cầu liên kết mới/i,
    });
    expect(escapeHatch).toHaveAttribute('href', '/forgot-password');
  });
});
