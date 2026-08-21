import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  allocatePayment,
  createCustomerBankAccount,
  deactivateCustomerBankAccount,
  fetchCustomerBankAccounts,
  updateCustomerBankAccount,
} from './customers-api';
import { useAllocatePayment } from './use-customers';

const apiRequest = vi.fn();
const postWithIdempotency = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
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

describe('customer bank accounts api', () => {
  it('lists bank accounts for one customer', async () => {
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    await expect(fetchCustomerBankAccounts('customer-1')).resolves.toEqual({
      items: [],
      total: 0,
    });

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/customers/customer-1/bank-accounts',
      method: 'GET',
    });
  });

  it('creates through the idempotent POST helper', async () => {
    const account = {
      id: 'account-1',
      customerId: 'customer-1',
      accountNumberMasked: '******2233',
      isActive: true,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    };
    postWithIdempotency.mockResolvedValueOnce(account);

    await expect(
      createCustomerBankAccount('customer-1', { accountNumber: '0011 2233' }),
    ).resolves.toEqual(account);

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/customers/customer-1/bank-accounts',
      { accountNumber: '0011 2233' },
    );
  });

  it('updates with PATCH and an idempotency key', async () => {
    apiRequest.mockResolvedValueOnce({ id: 'account-1' });

    await updateCustomerBankAccount('customer-1', 'account-1', {
      isActive: true,
    });

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/customers/customer-1/bank-accounts/account-1',
      method: 'PATCH',
      data: { isActive: true },
      headers: { 'Idempotency-Key': expect.any(String) },
    });
  });

  it('deactivates with DELETE and an idempotency key', async () => {
    apiRequest.mockResolvedValueOnce(undefined);

    await deactivateCustomerBankAccount('customer-1', 'account-1');

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/customers/customer-1/bank-accounts/account-1',
      method: 'DELETE',
      headers: { 'Idempotency-Key': expect.any(String) },
    });
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
