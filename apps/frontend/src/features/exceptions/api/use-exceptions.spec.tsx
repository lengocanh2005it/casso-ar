import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useBatchMarkPrepaid, useBatchSkip } from './use-exceptions';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useBatchSkip', () => {
  it('posts the selected ids to batch-skip', async () => {
    apiRequest.mockResolvedValue({ results: [] });
    const { result } = renderHook(() => useBatchSkip(), { wrapper });

    result.current.mutate(['tx-1', 'tx-2']);

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/batch-skip',
          method: 'POST',
          data: { ids: ['tx-1', 'tx-2'] },
        }),
      ),
    );
  });
});

describe('useBatchMarkPrepaid', () => {
  it('posts bankTransactionIds and one shared customerId to batch-mark-prepaid', async () => {
    apiRequest.mockResolvedValue({ results: [] });
    const { result } = renderHook(() => useBatchMarkPrepaid(), { wrapper });

    result.current.mutate({ ids: ['tx-1'], customerId: 'cust-1' });

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/batch-mark-prepaid',
          method: 'POST',
          data: { bankTransactionIds: ['tx-1'], customerId: 'cust-1' },
        }),
      ),
    );
  });
});
