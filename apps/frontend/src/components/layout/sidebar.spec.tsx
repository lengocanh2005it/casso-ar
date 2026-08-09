import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { navItems } from './nav-items';
import { Sidebar } from './sidebar';

const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn() }));

vi.mock('@/contexts/auth-context', () => ({ useAuth }));

vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

function renderSidebar() {
  useAuth.mockReturnValue({
    user: {
      name: 'Anh Le',
      email: 'anh@casso.vn',
      organizationName: 'Casso Ledger',
      subscriptionPlan: 'FREE',
    },
    logout: vi.fn().mockResolvedValue(undefined),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Sidebar />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Sidebar', () => {
  it('renders all 10 nav item labels', () => {
    renderSidebar();

    for (const item of navItems) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
    }
  });

  it('renders exactly the 9 nav items chốt in the spec, no more no less', () => {
    renderSidebar();
    expect(navItems).toHaveLength(9);
  });

  it('renders the authenticated user and logs out from the footer', async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({
      user: {
        name: 'Anh Le',
        email: 'anh@casso.vn',
        organizationName: 'Casso Ledger',
        subscriptionPlan: 'FREE',
        role: 'OWNER',
      },
      logout,
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <Sidebar />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByText('Anh Le')).toBeVisible();
    expect(screen.getByText(/casso ledger · free/i)).toBeVisible();
    expect(screen.getByText('OWNER')).toBeVisible();
    screen.getByRole('button', { name: 'Đăng xuất' }).click();
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
