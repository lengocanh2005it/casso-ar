import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { useDisconnectConnection } from './use-bank-connections';

const { disconnectConnection } = vi.hoisted(() => ({
  disconnectConnection: vi.fn(),
}));

vi.mock('./bank-connections-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bank-connections-api')>()),
  disconnectConnection,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

const useAuthMock = vi.mocked(useAuth);

function renderWithQueryClient() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return renderHook(() => useDisconnectConnection(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  });
}

describe('useDisconnectConnection', () => {
  it('refreshes the current user after disconnecting so the onboarding gate stays in sync', async () => {
    disconnectConnection.mockResolvedValueOnce({ success: true });
    const refreshUser = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({ refreshUser } as never);

    const { result } = renderWithQueryClient();

    result.current.mutate('conn-1');

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(refreshUser).toHaveBeenCalledOnce();
  });
});
