import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailOtpStep } from './email-otp-step';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));

vi.mock('@/lib/api-client', async () => {
  const { getApiErrorCode, getApiErrorMessage } = await import(
    '@/test/api-error-mock'
  );
  return { apiRequest, getApiErrorCode, getApiErrorMessage };
});

function fillOtp(code: string) {
  const boxes = screen.getAllByRole('textbox');
  code.split('').forEach((digit, i) => {
    fireEvent.change(boxes[i], { target: { value: digit } });
  });
}

describe('EmailOtpStep', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    sessionStorage.clear();
  });

  it('shows a masked-email hint, never an editable email field', () => {
    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.getByText(/leng\*\*\*@gmail\.com/)).toBeVisible();
    expect(screen.queryByRole('textbox', { name: /email/i })).toBeNull();
  });

  it('confirms the OTP and calls onVerified with the session', async () => {
    apiRequest.mockResolvedValueOnce({
      verified: true,
      accessToken: 'access-token',
    });
    const onVerified = vi.fn();

    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={onVerified} />
      </MemoryRouter>,
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(onVerified).toHaveBeenCalledWith({
        verified: true,
        accessToken: 'access-token',
      }),
    );
    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/auth/verify-email',
      method: 'POST',
      data: { email: 'lengocanh@gmail.com', otp: '482913' },
    });
  });

  it('shows an inline error for an invalid or expired code', async () => {
    apiRequest.mockRejectedValueOnce({
      response: { data: { errorCode: 'UNAUTHORIZED' } },
    });

    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />
      </MemoryRouter>,
    );
    fillOtp('000000');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(
        screen.getByText(/mã không hợp lệ hoặc đã hết hạn/i),
      ).toBeVisible(),
    );
  });

  it('resends a fresh code', async () => {
    apiRequest.mockResolvedValueOnce({ success: true });

    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi lại mã/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith({
        url: '/api/v1/auth/resend-verification',
        method: 'POST',
        data: { email: 'lengocanh@gmail.com' },
      }),
    );
    expect(
      await screen.findByText(
        'Nếu email này cần xác thực, hệ thống sẽ gửi mã mới. Hãy kiểm tra hộp thư.',
      ),
    ).toBeVisible();
  });

  it('disables resend and shows a countdown after a successful resend', async () => {
    apiRequest.mockResolvedValueOnce({ success: true });

    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi lại mã/i }));

    const resendButton = await screen.findByRole('button', {
      name: /gửi lại mã \(30s\)/i,
    });
    expect(resendButton).toBeDisabled();
  });

  it('does not start a cooldown when the resend request fails', async () => {
    apiRequest.mockRejectedValueOnce({
      response: { data: { errorCode: 'RATE_LIMIT_EXCEEDED' } },
    });

    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: /gửi lại mã/i }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(1));
    expect(
      screen.getByRole('button', { name: /^gửi lại mã$/i }),
    ).not.toBeDisabled();
  });

  it('shows a pending-review state when the code was correct but the org is pending', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_PENDING_REVIEW',
          message: 'Tổ chức của bạn đang chờ được duyệt.',
        },
      },
    });
    const onVerified = vi.fn();

    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={onVerified} />
      </MemoryRouter>,
    );
    fillOtp('482913');
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() =>
      expect(screen.getByText(/email đã được xác minh/i)).toBeVisible(),
    );
    // State changes swap the whole form, so the terminal block animates in
    // instead of snapping — and respects prefers-reduced-motion.
    const pending = screen.getByRole('status');
    expect(pending).toHaveClass('animate-fade-up');
    expect(pending).toHaveClass('motion-reduce:animate-none');
    expect(screen.getByText(/kiểm tra thông tin tổ chức/i)).toBeInTheDocument();
    expect(
      screen.getByText(/sau khi được duyệt, đăng nhập để bắt đầu/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/mã không hợp lệ hoặc đã hết hạn/i),
    ).not.toBeInTheDocument();
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('shows a rejected state with the API message', async () => {
    apiRequest.mockRejectedValueOnce({
      response: {
        data: {
          errorCode: 'ORGANIZATION_REJECTED',
          message: 'Đăng ký tổ chức của bạn chưa được chấp thuận.',
        },
      },
    });

    render(
      <MemoryRouter>
        <EmailOtpStep email="lengocanh@gmail.com" onVerified={vi.fn()} />
      </MemoryRouter>,
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
