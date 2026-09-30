import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useReceivables } from './use-receivables';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiRequestWithHeaders: vi.fn(),
  postWithIdempotency: vi.fn(),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

const customerAPage = {
  items: [{ id: 'receivable-a', customerId: 'customer-a' }],
  total: 1,
  page: 1,
  limit: 100,
};

describe('useReceivables', () => {
  it("does not show another customer's receivables while a new customer loads", async () => {
    apiRequest.mockReset();
    apiRequest
      .mockResolvedValueOnce(customerAPage)
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ customerId }) => useReceivables({ customerId }, 1, 100),
      { wrapper, initialProps: { customerId: 'customer-a' } },
    );
    await waitFor(() => expect(result.current.data).toEqual(customerAPage));

    // Customer detail reuses its component across ids; stale rows there
    // would be offered as allocation targets for the wrong customer.
    rerender({ customerId: 'customer-b' });

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
  });

  it('keeps the previous page while the next one loads when asked to', async () => {
    apiRequest.mockReset();
    apiRequest
      .mockResolvedValueOnce(customerAPage)
      .mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(
      ({ page }) => useReceivables({}, page, 20, { keepPreviousPage: true }),
      { wrapper, initialProps: { page: 1 } },
    );
    await waitFor(() => expect(result.current.data).toEqual(customerAPage));

    rerender({ page: 2 });

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(result.current.data).toEqual(customerAPage);
    expect(result.current.isPlaceholderData).toBe(true);
  });
});
