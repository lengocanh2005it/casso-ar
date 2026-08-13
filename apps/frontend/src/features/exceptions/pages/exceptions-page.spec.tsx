import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ExceptionsPage } from './exceptions-page';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: vi.fn(),
}));

describe('ExceptionsPage', () => {
  it('sends the search box value as a search filter', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExceptionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(
      await screen.findByPlaceholderText(
        'Tìm theo tên, số tài khoản hoặc nội dung chuyển khoản',
      ),
      { target: { value: 'nguyen van a' } },
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/unmatched',
          params: expect.objectContaining({ search: 'nguyen van a' }),
        }),
      ),
    );
  });
});
