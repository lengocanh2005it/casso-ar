import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { useInitiatePlanUpgrade } from './use-settings';

const { initiatePlanUpgrade } = vi.hoisted(() => ({
  initiatePlanUpgrade: vi.fn(),
}));

vi.mock('./settings-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./settings-api')>()),
  initiatePlanUpgrade,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useInitiatePlanUpgrade(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('useInitiatePlanUpgrade', () => {
  it('resolves with the checkout URL on success', async () => {
    initiatePlanUpgrade.mockResolvedValueOnce({
      checkoutUrl: 'https://pay.payos.vn/web/abc123',
      orderCode: '1001',
    });

    const { result } = renderWithQueryClient();

    result.current.mutate({
      targetPlanId: 'STARTER',
      returnUrl: 'http://localhost:5173/settings?tab=billing&status=success',
      cancelUrl: 'http://localhost:5173/settings?tab=billing&status=cancel',
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(initiatePlanUpgrade).toHaveBeenCalledWith(
      'STARTER',
      'http://localhost:5173/settings?tab=billing&status=success',
      'http://localhost:5173/settings?tab=billing&status=cancel',
    );
    expect(result.current.data).toEqual({
      checkoutUrl: 'https://pay.payos.vn/web/abc123',
      orderCode: '1001',
    });
  });

  it('shows a generic toast on failure', async () => {
    initiatePlanUpgrade.mockRejectedValueOnce(new Error('network error'));

    const { result } = renderWithQueryClient();

    result.current.mutate({
      targetPlanId: 'STARTER',
      returnUrl: 'http://localhost:5173/settings?tab=billing&status=success',
      cancelUrl: 'http://localhost:5173/settings?tab=billing&status=cancel',
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith(
      'Không thể tạo đơn thanh toán, vui lòng thử lại.',
    );
  });
});
