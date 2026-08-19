import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CancelDialog } from './cancel-dialog';

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

function renderDialog(receivableId = 'r1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <CancelDialog receivableId={receivableId} />
    </QueryClientProvider>,
  );
}

describe('CancelDialog', () => {
  it('calls the cancel endpoint for the receivable on confirm', async () => {
    apiRequest.mockResolvedValue({ id: 'r1' });
    renderDialog();

    fireEvent.click(screen.getByText('Hủy'));
    expect(
      screen.getByText(/chưa có khoản thanh toán nào/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/r1/cancel',
          method: 'POST',
        }),
      ),
    );
  });

  it('renders the error state when the cancel request fails', async () => {
    apiRequest.mockRejectedValue(new Error('boom'));
    renderDialog();

    fireEvent.click(screen.getByText('Hủy'));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() =>
      expect(screen.getByRole('alert', { name: '' })).toHaveTextContent(
        'Không thể hủy khoản phải thu.',
      ),
    );
  });

  it('does not show the raw receivable id in the dialog title', () => {
    renderDialog('a1b2c3d4-e5f6-47a8-9abc-1234567890ab');

    fireEvent.click(screen.getByText('Hủy'));
    expect(screen.getByRole('heading', { level: 2 })).not.toHaveTextContent(
      'a1b2c3d4-e5f6-47a8-9abc-1234567890ab',
    );
  });
});
