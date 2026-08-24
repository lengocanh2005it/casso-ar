import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChangePasswordForm } from './change-password-form';

const apiRequest = vi.fn();
const toastError = vi.fn();
const toastSuccess = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChangePasswordForm onBack={vi.fn()} onSuccess={vi.fn()} />
    </QueryClientProvider>,
  );
}

async function goToConfirmStep() {
  apiRequest.mockResolvedValueOnce(undefined);
  fireEvent.change(screen.getByLabelText(/mật khẩu hiện tại/i), {
    target: { value: 'current-pass' },
  });
  fireEvent.click(screen.getByRole('button', { name: /gửi otp/i }));
  await screen.findByRole('button', { name: /^gửi lại otp$/i });
}

describe('ChangePasswordForm', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    toastError.mockReset();
    toastSuccess.mockReset();
    sessionStorage.clear();
  });

  it('disables resend and shows a countdown after a successful resend', async () => {
    renderForm();
    await goToConfirmStep();

    apiRequest.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: /gửi lại otp/i }));

    const resendButton = await screen.findByRole('button', {
      name: /gửi lại otp \(30s\)/i,
    });
    expect(resendButton).toBeDisabled();
  });

  it('does not start a cooldown when the resend request fails', async () => {
    renderForm();
    await goToConfirmStep();

    apiRequest.mockRejectedValueOnce(new Error('rate limited'));
    fireEvent.click(screen.getByRole('button', { name: /gửi lại otp/i }));

    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(
      screen.getByRole('button', { name: /^gửi lại otp$/i }),
    ).not.toBeDisabled();
  });
});
