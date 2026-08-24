import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { describe, expect, it, vi } from 'vitest';
import { useReprocessWebhook } from './use-webhook-inbox';

const { reprocessWebhookInbox } = vi.hoisted(() => ({
  reprocessWebhookInbox: vi.fn(),
}));

vi.mock('./webhook-inbox-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./webhook-inbox-api')>()),
  reprocessWebhookInbox,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(() => useReprocessWebhook(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
  return { queryClient, ...view };
}

describe('useReprocessWebhook', () => {
  it('shows a success toast and invalidates the webhook inbox query', async () => {
    reprocessWebhookInbox.mockResolvedValueOnce({
      id: 'wh-1',
      status: 'PROCESSED',
    });
    const { result, queryClient } = renderWithQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    result.current.mutate('wh-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(reprocessWebhookInbox).toHaveBeenCalledWith('wh-1');
    expect(toast.success).toHaveBeenCalledWith('Đã xử lý lại webhook.');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['webhook-inbox'] });
  });

  it('shows an error toast on failure', async () => {
    reprocessWebhookInbox.mockRejectedValueOnce(new Error('conflict'));
    const { result } = renderWithQueryClient();

    result.current.mutate('wh-1');

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith('Không thể xử lý lại webhook.');
  });
});
