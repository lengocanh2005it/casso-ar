import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import {
  useConfirmCassoFlow,
  useDisconnectConnection,
  useRevealCassoFlowApiKey,
} from './use-bank-connections';

const {
  confirmCassoFlow,
  disconnectConnection,
  revealCassoFlowApiKey,
  getApiErrorCode,
  toastError,
} = vi.hoisted(() => ({
  confirmCassoFlow: vi.fn(),
  disconnectConnection: vi.fn(),
  revealCassoFlowApiKey: vi.fn(),
  getApiErrorCode: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('./bank-connections-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./bank-connections-api')>()),
  confirmCassoFlow,
  disconnectConnection,
  revealCassoFlowApiKey,
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

  it('leaves connection errors to the picker inline alert', async () => {
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

    expect(toastError).not.toHaveBeenCalled();
  });
});

describe('useRevealCassoFlowApiKey', () => {
  it('resolves with the revealed API key on success', async () => {
    revealCassoFlowApiKey.mockResolvedValueOnce({ apiKey: 'AK_CS.real-key' });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useRevealCassoFlowApiKey(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    const response = await result.current.mutateAsync({
      authorizationId: 'auth-1',
      password: 'correct',
    });

    expect(response.apiKey).toBe('AK_CS.real-key');
    expect(revealCassoFlowApiKey).toHaveBeenCalledWith('auth-1', {
      password: 'correct',
    });
  });

  it('shows a Vietnamese wrong-password toast on UNAUTHORIZED', async () => {
    const error = new Error('unauthorized');
    revealCassoFlowApiKey.mockRejectedValueOnce(error);
    getApiErrorCode.mockReturnValue('UNAUTHORIZED');
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { result } = renderHook(() => useRevealCassoFlowApiKey(), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    });

    await expect(
      result.current.mutateAsync({
        authorizationId: 'auth-1',
        password: 'wrong',
      }),
    ).rejects.toThrow();

    expect(toastError).toHaveBeenCalledWith('Mật khẩu không đúng.');
  });
});
