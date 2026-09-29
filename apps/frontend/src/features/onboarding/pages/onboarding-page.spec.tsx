import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/features/bank-connections/api/use-bank-connections', () => ({
  useConfirmCassoFlow: vi.fn(),
  usePreviewCassoFlowAccounts: vi.fn(),
}));

function renderPage(user: { role: string; bankingLinked: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const refreshUser = vi.fn().mockResolvedValue(undefined);
  const logout = vi.fn().mockResolvedValue(undefined);
  useAuthMock.mockReturnValue({
    user: {
      id: 'user-1',
      email: 'owner@casso.vn',
      name: 'Owner',
      organizationId: 'org-1',
      organizationName: 'Casso AR',
      subscriptionPlan: 'FREE',
      ...user,
    },
    isLoading: false,
    isAuthenticated: true,
    refreshUser,
    logout,
  } as never);

  return {
    refreshUser,
    logout,
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
    usePreviewCassoFlowAccountsMock.mockReturnValue({} as never);
    useConfirmCassoFlowMock.mockReturnValue({} as never);

    renderPage({ role: 'VIEWER', bankingLinked: false });

    expect(screen.getByText('Liên kết ngân hàng')).toBeInTheDocument();
    expect(screen.getByText('Kết nối an toàn')).toBeVisible();
    expect(screen.getByText(/owner hoặc finance manager/i)).toBeInTheDocument();
  });

  it('lets an unlinked owner skip onboarding and continue to the dashboard', async () => {
    usePreviewCassoFlowAccountsMock.mockReturnValue({} as never);
    useConfirmCassoFlowMock.mockReturnValue({} as never);

    renderPage({ role: 'OWNER', bankingLinked: false });

    fireEvent.click(
      screen.getByRole('button', { name: /bỏ qua, đến trang chủ/i }),
    );

    expect(await screen.findByText('dashboard')).toBeInTheDocument();
  });

  it('shows the logo and lets the user log out without connecting', () => {
    usePreviewCassoFlowAccountsMock.mockReturnValue({} as never);
    useConfirmCassoFlowMock.mockReturnValue({} as never);

    const { logout } = renderPage({ role: 'OWNER', bankingLinked: false });

    expect(screen.getByRole('link', { name: /casso ar/i })).toBeVisible();

    fireEvent.click(screen.getByRole('button', { name: /đăng xuất/i }));

    expect(logout).toHaveBeenCalledOnce();
  });

  it('refreshes the profile and navigates to dashboard after connecting', async () => {
    const previewMutation = {
      mutateAsync: vi.fn().mockResolvedValue({
        businessId: 'biz-1',
        accounts: [
          {
            accountNumber: '111',
            bankName: 'VPBank',
            accountHolderName: 'NGUYEN VAN A',
            status: 'AVAILABLE',
          },
        ],
      }),
    };
    const confirmMutation = {
      mutateAsync: vi.fn().mockResolvedValue({ connected: [], skipped: [] }),
    };
    usePreviewCassoFlowAccountsMock.mockReturnValue(previewMutation as never);
    useConfirmCassoFlowMock.mockReturnValue(confirmMutation as never);

    const { refreshUser } = renderPage({
      role: 'OWNER',
      bankingLinked: false,
    });

    const input = screen.getByLabelText(/Casso Flow API Key/i);
    const previewBtn = screen.getByRole('button', { name: /xem tài khoản/i });

    fireEvent.change(input, { target: { value: 'test-casso-api-key' } });
    fireEvent.click(previewBtn);

    await waitFor(() => {
      expect(previewMutation.mutateAsync).toHaveBeenCalledWith({
        apiKey: 'test-casso-api-key',
      });
    });
    fireEvent.click(screen.getByRole('button', { name: /xác nhận/i }));

    await waitFor(() => {
      expect(confirmMutation.mutateAsync).toHaveBeenCalledWith({
        apiKey: 'test-casso-api-key',
        selectedAccountNumbers: ['111'],
      });
      expect(refreshUser).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText('dashboard')).toBeInTheDocument();
  });
});
