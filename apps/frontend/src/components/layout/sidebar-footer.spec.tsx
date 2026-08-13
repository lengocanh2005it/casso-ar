import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/theme-context';
import { SidebarFooter } from './sidebar-footer';

const { apiRequest, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));

describe('SidebarFooter', () => {
  it('renders AlertBell next to ThemeToggle for an OWNER', async () => {
    useAuth.mockReturnValue({
      user: {
        name: 'Chủ sở hữu',
        email: 'owner@congtyb.vn',
        organizationName: 'Công ty B',
        subscriptionPlan: 'BUSINESS',
        role: 'OWNER',
      },
      logout: vi.fn(),
    });
    apiRequest.mockResolvedValue({ items: [], total: 0, unreadCount: 0 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ThemeProvider>
        <MemoryRouter>
          <QueryClientProvider client={queryClient}>
            <SidebarFooter collapsed={false} />
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(
      await screen.findByRole('button', { name: 'Thông báo' }),
    ).toBeInTheDocument();
  });
});
