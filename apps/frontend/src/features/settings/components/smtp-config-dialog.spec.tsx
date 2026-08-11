import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { SmtpConfig } from '../types';
import { SmtpConfigDialog } from './smtp-config-dialog';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function renderDialog(existingConfig: SmtpConfig | null = null) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <SmtpConfigDialog
        trigger={<button type="button">Cấu hình SMTP</button>}
        existingConfig={existingConfig}
      />
    </QueryClientProvider>,
  );
}

describe('SmtpConfigDialog', () => {
  it('prefills host/username/fromAddress but leaves password blank when editing', () => {
    renderDialog({
      host: 'smtp.congtyb.vn',
      port: 587,
      username: 'noreply@congtyb.vn',
      fromAddress: 'noreply@congtyb.vn',
      status: 'CONNECTED',
    });
    fireEvent.click(screen.getByText('Cấu hình SMTP'));

    expect(screen.getByLabelText(/máy chủ/i)).toHaveValue('smtp.congtyb.vn');
    expect(screen.getByLabelText(/mật khẩu/i)).toHaveValue('');
  });

  it('shows "Đang kiểm tra kết nối…" while the save request is pending', async () => {
    apiRequest.mockImplementation(() => new Promise(() => {}));
    renderDialog();
    fireEvent.click(screen.getByText('Cấu hình SMTP'));
    fireEvent.change(screen.getByLabelText(/máy chủ/i), {
      target: { value: 'smtp.a.vn' },
    });
    fireEvent.change(screen.getByLabelText(/cổng/i), {
      target: { value: '587' },
    });
    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), {
      target: { value: 'a@a.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'pw' },
    });
    fireEvent.change(screen.getByLabelText(/gửi từ/i), {
      target: { value: 'a@a.vn' },
    });

    fireEvent.click(screen.getByRole('button', { name: /lưu cấu hình/i }));

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /đang kiểm tra kết nối/i }),
      ).toBeDisabled(),
    );
  });

  it('surfaces SMTP_CONNECTION_FAILED inline instead of a toast', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        status: 400,
        data: { message: 'Không thể kết nối tới smtp.a.vn: auth rejected' },
      },
    });
    renderDialog();
    fireEvent.click(screen.getByText('Cấu hình SMTP'));
    fireEvent.change(screen.getByLabelText(/máy chủ/i), {
      target: { value: 'smtp.a.vn' },
    });
    fireEvent.change(screen.getByLabelText(/cổng/i), {
      target: { value: '587' },
    });
    fireEvent.change(screen.getByLabelText(/tên đăng nhập/i), {
      target: { value: 'a@a.vn' },
    });
    fireEvent.change(screen.getByLabelText(/mật khẩu/i), {
      target: { value: 'pw' },
    });
    fireEvent.change(screen.getByLabelText(/gửi từ/i), {
      target: { value: 'a@a.vn' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lưu cấu hình/i }));

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/không thể kết nối/i),
    );
  });
});
