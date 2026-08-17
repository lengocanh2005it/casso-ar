import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateReceivableDialog } from './create-receivable-dialog';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown, headers?: unknown) =>
    apiRequest({
      url,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'test-key', ...(headers as object) },
    }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CreateReceivableDialog />
    </QueryClientProvider>,
  );
}

describe('CreateReceivableDialog', () => {
  it('creates a receivable with the form values on submit', async () => {
    apiRequest.mockResolvedValue({ id: 'r1' });
    renderDialog();

    fireEvent.click(screen.getByText('Tạo khoản phải thu'));
    fireEvent.change(screen.getByLabelText(/mã khách hàng/i), {
      target: { value: 'c-123' },
    });
    fireEvent.change(screen.getByLabelText(/số tiền/i), {
      target: { value: '50000000' },
    });
    fireEvent.change(screen.getByLabelText(/hạn thanh toán/i), {
      target: { value: '2026-09-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables',
          method: 'POST',
          data: {
            customerId: 'c-123',
            originalAmount: 50_000_000,
            dueDate: '2026-09-01',
          },
        }),
      ),
    );
  });

  it('renders the error state when the create request fails', async () => {
    apiRequest.mockRejectedValue(new Error('boom'));
    renderDialog();

    fireEvent.click(screen.getByText('Tạo khoản phải thu'));
    fireEvent.change(screen.getByLabelText(/mã khách hàng/i), {
      target: { value: 'c-123' },
    });
    fireEvent.change(screen.getByLabelText(/số tiền/i), {
      target: { value: '50000000' },
    });
    fireEvent.change(screen.getByLabelText(/hạn thanh toán/i), {
      target: { value: '2026-09-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() =>
      expect(screen.getByRole('alert', { name: '' })).toHaveTextContent(
        'Không thể tạo khoản phải thu.',
      ),
    );
  });
});
