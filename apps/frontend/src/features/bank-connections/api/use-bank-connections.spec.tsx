import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import {
  useConfirmCassoFlow,
  useDisconnectConnection,
} from './use-bank-connections';

const { confirmCassoFlow, disconnectConnection, getApiErrorCode, toastError } =
  vi.hoisted(() => ({
    confirmCassoFlow: vi.fn(),
    disconnectConnection: vi.fn(),
    getApiErrorCode: vi.fn(),
    toastError: vi.fn(),
  }));

vi.mock('./bank-connections-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bank-connections-api')>()),
  confirmCassoFlow,
  disconnectConnection,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: toastError },
}));

vi.mock('@/lib/api-client', () => ({
  getApiErrorCode,
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

const useAuthMock = vi.mocked(useAuth);

beforeEach(() => {
  confirmCassoFlow.mockReset();
  getApiErrorCode.mockReset();
  toastError.mockReset();
});

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

describe('useConfirmCassoFlow', () => {
  it('does not show a duplicate toast for plan-limit errors', async () => {
    const error = new Error('plan limit');
    confirmCassoFlow.mockRejectedValueOnce(error);
    getApiErrorCode.mockReturnValue('PLAN_LIMIT_EXCEEDED');
    useAuthMock.mockReturnValue({ refreshUser: vi.fn() } as never);

    const { result } = renderHook(() => useConfirmCassoFlow(), {
      wrapper: ({ children }) => (
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { mutations: { retry: false } } })
          }
        >
          {children}
        </QueryClientProvider>
      ),
    });

    result.current.mutate({ apiKey: 'key', selectedAccountNumbers: ['111'] });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastError).not.toHaveBeenCalled();
  });

  it('shows a generic toast for non-plan-limit errors', async () => {
    const error = new Error('invalid key');
    confirmCassoFlow.mockRejectedValueOnce(error);
    getApiErrorCode.mockReturnValue('UNAUTHORIZED');
    useAuthMock.mockReturnValue({ refreshUser: vi.fn() } as never);

    const { result } = renderHook(() => useConfirmCassoFlow(), {
      wrapper: ({ children }) => (
        <QueryClientProvider
          client={
            new QueryClient({ defaultOptions: { mutations: { retry: false } } })
          }
        >
          {children}
        </QueryClientProvider>
      ),
    });

    result.current.mutate({ apiKey: 'key', selectedAccountNumbers: ['111'] });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toastError).toHaveBeenCalledWith(
      'Không thể kết nối Casso Flow. Vui lòng kiểm tra lại API Key.',
    );
  });
});
