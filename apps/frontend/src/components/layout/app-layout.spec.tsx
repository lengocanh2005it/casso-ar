import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeProvider } from '@/contexts/theme-context';
import { AppLayout } from './app-layout';

const { apiRequest, useAuth } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  API_BASE_URL: 'http://localhost:3000',
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue(null) },
}));
vi.mock('@/contexts/auth-context', () => ({ useAuth }));
vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

function renderAppLayoutFor(role: string, bankingLinked: boolean) {
  useAuth.mockReturnValue({
    user: {
      name: 'Member',
      email: 'member@congtyb.vn',
      organizationName: 'Công ty B',
      subscriptionPlan: 'BUSINESS',
      role,
      bankingLinked,
    },
    logout: vi.fn(),
  });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/dashboard']}>
        <QueryClientProvider client={queryClient}>
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="dashboard" element={<div>Dashboard</div>} />
            </Route>
          </Routes>
        </QueryClientProvider>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('AppLayout', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    useAuth.mockReset();
  });

  it('renders AlertBell in the mobile header for an OWNER', async () => {
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
        <MemoryRouter initialEntries={['/dashboard']}>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="dashboard" element={<div>Dashboard</div>} />
              </Route>
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(
      (await screen.findAllByRole('button', { name: 'Thông báo' })).length,
    ).toBeGreaterThan(0);
  });

  it('does not render AlertBell or open an alerts SSE connection for a non-OWNER', async () => {
    class FakeEventSource {
      static instances: FakeEventSource[] = [];

      constructor(public url: string) {
        FakeEventSource.instances.push(this);
      }

      close() {}
    }
    FakeEventSource.instances = [];
    vi.stubGlobal('EventSource', FakeEventSource);

    useAuth.mockReturnValue({
      user: {
        name: 'Kế toán',
        email: 'accountant@congtyb.vn',
        organizationName: 'Công ty B',
        subscriptionPlan: 'BUSINESS',
        role: 'ACCOUNTANT',
      },
      logout: vi.fn(),
    });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="dashboard" element={<div>Dashboard</div>} />
              </Route>
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    expect(
      screen.queryByRole('button', { name: 'Thông báo' }),
    ).not.toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiRequest).not.toHaveBeenCalled();
    expect(FakeEventSource.instances).toHaveLength(0);

    vi.unstubAllGlobals();
  });

  it.each([
    { role: 'FINANCE_MANAGER', bankingLinked: false, canManage: true },
    { role: 'VIEWER', bankingLinked: false, canManage: false },
    { role: 'FINANCE_MANAGER', bankingLinked: true, canManage: false },
  ])(
    'shows the organization sync state for $role (linked: $bankingLinked)',
    ({ role, bankingLinked, canManage }) => {
      renderAppLayoutFor(role, bankingLinked);

      if (bankingLinked) {
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
        return;
      }

      expect(screen.getByRole('status')).toHaveTextContent(
        /tự động đồng bộ giao dịch.*không khả dụng/i,
      );
      if (canManage) {
        expect(
          screen.getByRole('link', { name: /quản lý kết nối ngân hàng/i }),
        ).toHaveAttribute('href', '/bank-connections');
      } else {
        expect(screen.getByRole('status')).toHaveTextContent(
          /liên hệ owner hoặc finance manager/i,
        );
        expect(
          screen.queryByRole('link', { name: /quản lý kết nối ngân hàng/i }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it('centers page content on the light application canvas', () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn() });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="dashboard" element={<div>Dashboard</div>} />
              </Route>
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const main = screen.getByRole('main');
    expect(main).toHaveClass('bg-app-canvas');
    expect(main).toHaveClass('min-h-0');
    expect(main.parentElement).toHaveClass('min-h-0');
    expect(main.firstElementChild).toHaveClass(
      'mx-auto',
      'max-w-[1600px]',
      'min-h-full',
    );
  });

  it('keeps document scrolling outside the fixed app viewport', () => {
    renderAppLayoutFor('OWNER', true);

    const main = screen.getByRole('main');
    const shell = main.parentElement?.parentElement;

    expect(shell).toHaveClass('fixed', 'inset-0', 'overflow-hidden');
    expect(main).toHaveClass('overflow-auto');
  });

  it("keeps regular pages growing past the viewport (min-h-full), so main's bottom padding stays visible on scroll", () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn() });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/customers']}>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="customers" element={<div>Customers</div>} />
              </Route>
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const main = screen.getByRole('main');
    expect(main.firstElementChild).toHaveClass('min-h-full');
    expect(main.firstElementChild).not.toHaveClass('h-full');
  });

  it('gives the Copilot route an exact-fit shell (h-full) instead of growing past the viewport', () => {
    useAuth.mockReturnValue({ user: null, logout: vi.fn() });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/copilot']}>
          <QueryClientProvider client={queryClient}>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="copilot" element={<div>Copilot</div>} />
              </Route>
            </Routes>
          </QueryClientProvider>
        </MemoryRouter>
      </ThemeProvider>,
    );

    const main = screen.getByRole('main');
    expect(main.firstElementChild).toHaveClass('h-full');
    expect(main.firstElementChild).not.toHaveClass('min-h-full');
  });
});
