import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { allocatePayment } from './customers-api';
import { useAllocatePayment } from './use-customers';

const postWithIdempotency = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: vi.fn(),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(
      QueryClientProvider,
      { client: queryClient },
      children,
    );
  };
}

describe('allocatePayment', () => {
  it('posts the receivable allocation through the payment allocate endpoint', async () => {
    postWithIdempotency.mockResolvedValue({ id: 'allocation-1' });

    await expect(
      allocatePayment('payment-1', {
        receivableId: 'receivable-1',
        amount: 500_000,
      }),
    ).resolves.toEqual({ id: 'allocation-1' });

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/payments/payment-1/allocate',
      { receivableId: 'receivable-1', amount: 500_000 },
    );
  });
});

describe('useAllocatePayment', () => {
  it('invalidates customer credits, receivables, and the affected receivable after success', async () => {
    postWithIdempotency.mockResolvedValue({ id: 'allocation-1' });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateQueries = vi
      .spyOn(queryClient, 'invalidateQueries')
      .mockResolvedValue();

    const { result } = renderHook(() => useAllocatePayment(), {
      wrapper: createWrapper(queryClient),
    });

    await result.current.mutateAsync({
      paymentId: 'payment-1',
      receivableId: 'receivable-1',
      amount: 500_000,
    });

    await waitFor(() => expect(invalidateQueries).toHaveBeenCalledTimes(3));

    expect(invalidateQueries).toHaveBeenNthCalledWith(1, {
      queryKey: ['customer-credits'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(2, {
      queryKey: ['receivables'],
    });
    expect(invalidateQueries).toHaveBeenNthCalledWith(3, {
      queryKey: ['receivable', 'receivable-1'],
    });
  });
});
