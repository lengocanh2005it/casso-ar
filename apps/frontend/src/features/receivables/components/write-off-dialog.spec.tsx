import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WriteOffDialog } from './write-off-dialog';

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

describe('WriteOffDialog', () => {
  it('confirms before calling the write-off endpoint', async () => {
    apiRequest.mockResolvedValue({ id: 'r1' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WriteOffDialog receivableId="r1" />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByText('Xóa nợ'));
    expect(screen.getByText(/chấp nhận mất phần còn lại/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /xác nhận xóa nợ/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/r1/write-off',
          method: 'POST',
        }),
      ),
    );
  });
});
