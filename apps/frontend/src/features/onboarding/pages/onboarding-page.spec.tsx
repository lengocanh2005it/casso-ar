import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { useConnectCassoFlow } from '@/features/bank-connections/api/use-bank-connections';
import { OnboardingPage } from './onboarding-page';

const useAuthMock = vi.mocked(useAuth);
const useConnectCassoFlowMock = vi.mocked(useConnectCassoFlow);

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/features/bank-connections/api/use-bank-connections', () => ({
  useConnectCassoFlow: vi.fn(),
}));

function renderPage(user: { role: string; bankingLinked: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const refreshUser = vi.fn().mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({
    user: {
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      organizationId: 'org-1',
      organizationName: 'Casso Ledger',
      subscriptionPlan: 'FREE',
      ...user,
    },
    isLoading: false,
    isAuthenticated: true,
    refreshUser,
  } as never);

  return {
    refreshUser,
    ...render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    ),
  };
}

describe('OnboardingPage', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('shows a waiting state when the member cannot manage bank connections', () => {
    useConnectCassoFlowMock.mockReturnValue({} as never);

    renderPage({ role: 'VIEWER', bankingLinked: false });

    expect(screen.getByText('Liên kết ngân hàng')).toBeInTheDocument();
    expect(screen.getByText(/owner hoặc finance manager/i)).toBeInTheDocument();
  });

  it('refreshes the profile and navigates to dashboard after connecting', async () => {
    const connectMutation = {
      isPending: false,
      mutate: vi.fn(
        (_input: { apiKey: string }, options?: { onSuccess?: () => void }) => {
          options?.onSuccess?.();
        },
      ),
    };
    useConnectCassoFlowMock.mockReturnValue(connectMutation as never);

    const { refreshUser } = renderPage({
      role: 'OWNER',
      bankingLinked: false,
    });

    const input = screen.getByLabelText(/Casso Flow API Key/i);
    const submitBtn = screen.getByRole('button', { name: /kết nối/i });

    fireEvent.change(input, { target: { value: 'test-casso-api-key' } });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(connectMutation.mutate).toHaveBeenCalledWith(
        { apiKey: 'test-casso-api-key' },
        expect.any(Object),
      );
      expect(refreshUser).toHaveBeenCalledOnce();
    });
    expect(screen.getByText('dashboard')).toBeInTheDocument();
  });
});
