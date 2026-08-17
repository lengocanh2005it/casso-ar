import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DisputeDialog } from './dispute-dialog';

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

function renderDialog(props: {
  isDisputed: boolean;
  disputeId: string | null;
}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <DisputeDialog receivableId="r1" {...props} />
    </QueryClientProvider>,
  );
}

describe('DisputeDialog', () => {
  it('opens a dispute with the typed reason', async () => {
    apiRequest.mockResolvedValue({ id: 'd1' });
    renderDialog({ isDisputed: false, disputeId: null });

    fireEvent.click(screen.getByText('Mở tranh chấp'));
    fireEvent.change(screen.getByLabelText(/lý do tranh chấp/i), {
      target: { value: 'Khách hàng khiếu nại hóa đơn' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Xác nhận mở tranh chấp' }),
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/r1/disputes',
          method: 'POST',
          data: { reason: 'Khách hàng khiếu nại hóa đơn' },
        }),
      ),
    );
  });

  it('keeps the open-dispute button disabled until a reason is typed', () => {
    apiRequest.mockResolvedValue({ id: 'd1' });
    renderDialog({ isDisputed: false, disputeId: null });

    fireEvent.click(screen.getByText('Mở tranh chấp'));

    expect(
      screen.getByRole('button', { name: 'Xác nhận mở tranh chấp' }),
    ).toBeDisabled();
  });

  it('resolves the existing dispute via the dispute endpoint', async () => {
    apiRequest.mockResolvedValue({ id: 'd1' });
    renderDialog({ isDisputed: true, disputeId: 'd1' });

    fireEvent.click(screen.getByText('Đóng tranh chấp'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Xác nhận đóng tranh chấp' }),
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/disputes/d1/resolve',
          method: 'POST',
        }),
      ),
    );
  });
});
