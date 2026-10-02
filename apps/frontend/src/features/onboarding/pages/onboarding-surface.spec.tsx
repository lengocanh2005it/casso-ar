import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import {
  useConfirmCassoFlow,
  usePreviewCassoFlowAccounts,
} from '@/features/bank-connections/api/use-bank-connections';
import { OnboardingPage } from './onboarding-page';

const useAuthMock = vi.mocked(useAuth);
const useConfirmCassoFlowMock = vi.mocked(useConfirmCassoFlow);
const usePreviewCassoFlowAccountsMock = vi.mocked(usePreviewCassoFlowAccounts);

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));
vi.mock('@/features/bank-connections/api/use-bank-connections', () => ({
  useConfirmCassoFlow: vi.fn(),
  usePreviewCassoFlowAccounts: vi.fn(),
}));

describe('OnboardingPage surface', () => {
  afterEach(() => vi.clearAllMocks());

  // Onboarding is part of the same pre-login flow as /login and /signup, so it
  // must share AuthStatusCard rather than re-declaring its own gradient shell.
  it('renders the shared auth surface instead of a bespoke one', () => {
    usePreviewCassoFlowAccountsMock.mockReturnValue({} as never);
    useConfirmCassoFlowMock.mockReturnValue({} as never);
    useAuthMock.mockReturnValue({
      user: {
        id: 'user-1',
        email: 'owner@casso.vn',
        name: 'Owner',
        role: 'OWNER',
        organizationId: 'org-1',
        organizationName: 'Casso AR',
        subscriptionPlan: 'FREE',
        bankingLinked: false,
      },
      isLoading: false,
      isAuthenticated: true,
      refreshUser: vi.fn(),
      logout: vi.fn(),
    } as never);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/onboarding']}>
          <Routes>
            <Route path="/onboarding" element={<OnboardingPage />} />
            <Route path="/dashboard" element={<div>dashboard</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('auth-surface')).toBeInTheDocument();
  });
});
