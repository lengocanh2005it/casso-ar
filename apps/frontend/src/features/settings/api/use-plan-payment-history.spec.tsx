import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePlanPaymentHistory } from './use-settings';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));

describe('usePlanPaymentHistory', () => {
  it('keeps each organization history in its own query cache entry', () => {
    const queryClient = new QueryClient();
    useAuth.mockReturnValue({ user: { organizationId: 'org-1' } });

    const { rerender } = renderHook(
      () => usePlanPaymentHistory({ page: 1, limit: 20 }, false),
      {
        wrapper: ({ children }) => (
          <QueryClientProvider client={queryClient}>
            {children}
          </QueryClientProvider>
        ),
      },
    );

    useAuth.mockReturnValue({ user: { organizationId: 'org-2' } });
    rerender();

    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .map((query) => query.queryKey),
    ).toContainEqual(['plan-payment-history', 'org-1', 1, 20]);
    expect(
      queryClient
        .getQueryCache()
        .findAll()
        .map((query) => query.queryKey),
    ).toContainEqual(['plan-payment-history', 'org-2', 1, 20]);
  });
});
