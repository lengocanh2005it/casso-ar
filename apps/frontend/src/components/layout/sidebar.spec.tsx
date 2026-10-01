import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/theme-context';
import { Sidebar } from './sidebar';

const { useAuthMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

function renderSidebar(role: string) {
  useAuthMock.mockReturnValue({
    user: {
      name: 'Test User',
      email: 'test@example.com',
      role,
      subscriptionPlan: 'FREE',
    },
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );
}

describe('Sidebar', () => {
  it('has smooth width transition when collapsing', () => {
    renderSidebar('OWNER');

    expect(screen.getByRole('complementary')).toHaveClass('transition-[width]');
    expect(screen.getByText('Lịch sử công nợ')).toHaveClass('min-w-0');
    expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeInTheDocument();
  });

  it('shows the receivable balance history entry to an owner', () => {
    renderSidebar('OWNER');
    expect(screen.getByText('Lịch sử công nợ')).toBeInTheDocument();
  });

  it('shows the receivable balance history entry to a finance manager', () => {
    renderSidebar('FINANCE_MANAGER');
    expect(screen.getByText('Lịch sử công nợ')).toBeInTheDocument();
  });

  it('shows the receivable balance history entry to a viewer', () => {
    renderSidebar('VIEWER');
    expect(screen.getByText('Lịch sử công nợ')).toBeInTheDocument();
  });

  it.each(['ACCOUNTANT', 'SALES_REP'])(
    'hides the receivable balance history entry from %s',
    (role) => {
      renderSidebar(role);
      expect(screen.queryByText('Lịch sử công nợ')).not.toBeInTheDocument();
      expect(screen.getByText('Báo cáo')).toBeInTheDocument();
    },
  );
});
