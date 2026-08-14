import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ReceivablesBulkActionBar } from './receivables-bulk-action-bar';

const { apiRequest, toastError, toastSuccess } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

beforeEach(() => {
  apiRequest.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

function renderBar(onResult = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ReceivablesBulkActionBar
        selectedIds={['rec-1', 'rec-2']}
        onResult={onResult}
      />
    </QueryClientProvider>,
  );
}

describe('ReceivablesBulkActionBar', () => {
  it('confirms before sending a bulk write-off', async () => {
    apiRequest.mockResolvedValue({
      results: [
        { id: 'rec-1', status: 'success' },
        { id: 'rec-2', status: 'success' },
      ],
    });
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa nợ' }));
    expect(screen.getByText('Xóa nợ 2 khoản phải thu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa nợ' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/batch-write-off',
          data: { ids: ['rec-1', 'rec-2'] },
        }),
      ),
    );
  });

  it('confirms before sending a bulk cancel', async () => {
    apiRequest.mockResolvedValue({
      results: [
        { id: 'rec-1', status: 'success' },
        { id: 'rec-2', status: 'success' },
      ],
    });
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Hủy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận hủy' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/batch-cancel',
          data: { ids: ['rec-1', 'rec-2'] },
        }),
      ),
    );
  });

  it('reports a transport failure when bulk write-off fails', async () => {
    apiRequest.mockRejectedValue(new Error('network'));
    renderBar();

    fireEvent.click(screen.getByRole('button', { name: 'Xóa nợ' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xóa nợ' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không thể xử lý thao tác hàng loạt. Vui lòng thử lại.',
      ),
    );
  });
});
