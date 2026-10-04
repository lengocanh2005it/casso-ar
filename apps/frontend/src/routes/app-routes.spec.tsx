import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';
import { authTokenManager } from '@/lib/api-client';

const { getValidAccessToken, apiRequest, operatorToken } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
  operatorToken: { current: '' as string },
}));

vi.mock('@/lib/api-client', () => ({
  API_BASE_URL: '',
  authTokenManager: {
    getValidAccessToken,
    hasKnownSession: () => true,
    setAccessToken: vi.fn((token: string) => {
      operatorToken.current = token;
    }),
    getAccessToken: () => operatorToken.current || null,
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
  isOperatorToken: (token: string) => operatorToken.current === token,
  apiRequest,
}));

vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

function renderAppRoutesAt(initialEntry: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <MemoryRouter initialEntries={[initialEntry]}>
            <AppRoutes />
            <CurrentRoutePath />
          </MemoryRouter>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

function CurrentRoutePath() {
  const { pathname } = useLocation();
  return <output data-testid="current-route-path">{pathname}</output>;
}

function buildOperatorToken(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none' }));
  const body = btoa(JSON.stringify(payload));
  return `${header}.${body}.`;
}

describe('application routes', () => {
  // Cold-transforming a lazy page's module graph is CPU-bound and can take
  // seconds on a starved worker. Pay it here, against the hook budget, so the
  // per-test `waitFor` only measures rendering instead of module loading.
  beforeAll(async () => {
    await Promise.all([
      import('@/features/landing'),
      import('@/features/customers/pages/customers-page'),
      import('@/features/dashboard/pages/dashboard-page'),
      import('@/features/onboarding/pages/onboarding-page'),
    ]);
  }, 60_000);

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    operatorToken.current = '';
  });

  it('redirects an unauthenticated app route to login', async () => {
    getValidAccessToken.mockResolvedValue(null);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /đăng nhập/i })).toBeVisible(),
    );
  });

  it('exposes the invite route without the app shell', async () => {
    getValidAccessToken.mockResolvedValue(null);

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/invite-accept?token=invite-token']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: /nhận lời mời/i }),
      ).toBeVisible(),
    );
    // The auth surface has its own aside, but the app shell's sidebar
    // (the one that names the current organization) must stay absent.
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('exposes the standalone admin login route', async () => {
    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/admin/login']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByText(/trang đăng nhập dành cho quản trị viên/i),
      ).toBeVisible(),
    );
  });

  it('sends the bare admin path to the dashboard instead of an empty shell', async () => {
    // The admin shell is operator-only, so stand up an operator token first —
    // otherwise AdminRoute sends the visitor to /admin/login and the assertion
    // would pass for the wrong reason.
    authTokenManager.setAccessToken(
      buildOperatorToken({ isOperator: true, exp: Date.now() / 1000 + 3600 }),
    );

    renderAppRoutesAt('/admin');

    // "/admin" has no index route. Without an explicit redirect the admin
    // layout renders with an empty <Outlet/>, so an operator who types or
    // bookmarks the portal root gets a blank page under a working sidebar.
    await waitFor(() =>
      expect(screen.getByTestId('current-route-path')).toHaveTextContent(
        '/admin/dashboard',
      ),
    );
  });

  it('renders the public landing page at the root route for guests', async () => {
    getValidAccessToken.mockResolvedValue(null);
    apiRequest.mockResolvedValue([]);
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );

    renderAppRoutesAt('/');

    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', { name: /thu tiền/i }),
        ).toBeInTheDocument(),
      { timeout: 10_000 },
    );
  }, 15_000);

  it('redirects authenticated visitors from the root route to the dashboard', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    vi.stubGlobal(
      'EventSource',
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        close() {}
      },
    );
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/auth/me') {
        return Promise.resolve({
          id: 'user-1',
          email: 'owner@example.com',
          name: 'Owner',
          role: 'OWNER',
          organizationId: 'org-1',
          organizationName: 'Org',
          subscriptionPlan: 'FREE',
          bankingLinked: true,
        });
      }
      return new Promise(() => {});
    });

    renderAppRoutesAt('/');

    await waitFor(() =>
      expect(screen.getByTestId('current-route-path')).toHaveTextContent(
        '/dashboard',
      ),
    );
  });

  it('lets an unlinked organization use an authenticated app route', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/auth/me') {
        return Promise.resolve({
          id: 'user-1',
          email: 'viewer@example.com',
          name: 'Viewer',
          role: 'VIEWER',
          organizationId: 'org-1',
          organizationName: 'Org',
          subscriptionPlan: 'FREE',
          bankingLinked: false,
        });
      }
      return new Promise(() => {});
    });

    renderAppRoutesAt('/customers');

    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', { name: /khách hàng/i }),
        ).toBeVisible(),
      { timeout: 15_000 },
    );
  }, 20_000);

  it('lets an OWNER skip unlinked onboarding and reach the dashboard', async () => {
    getValidAccessToken.mockResolvedValue('access-token');
    vi.stubGlobal(
      'EventSource',
      class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        close() {}
      },
    );
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/auth/me') {
        return Promise.resolve({
          id: 'user-1',
          email: 'owner@example.com',
          name: 'Owner',
          role: 'OWNER',
          organizationId: 'org-1',
          organizationName: 'Org',
          subscriptionPlan: 'FREE',
          bankingLinked: false,
        });
      }
      return new Promise(() => {});
    });

    renderAppRoutesAt('/onboarding');

    fireEvent.click(
      await screen.findByRole('button', { name: /bỏ qua, đến trang chủ/i }),
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Trang chủ' })).toBeVisible(),
    );
  }, 20_000);

  it('updates the sync notice in both directions on the 60-second profile refresh', async () => {
    vi.useFakeTimers();
    getValidAccessToken.mockResolvedValue('access-token');
    const linkStates = [false, true, false];
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/auth/me') {
        return Promise.resolve({
          id: 'user-1',
          email: 'manager@example.com',
          name: 'Manager',
          role: 'FINANCE_MANAGER',
          organizationId: 'org-1',
          organizationName: 'Org',
          subscriptionPlan: 'FREE',
          bankingLinked: linkStates.shift() ?? false,
        });
      }
      return new Promise(() => {});
    });

    renderAppRoutesAt('/dashboard');

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(
      screen.getByText(/tổ chức chưa có kết nối ngân hàng/i),
    ).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(
      screen.queryByText(/tổ chức chưa có kết nối ngân hàng/i),
    ).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(
      screen.getByText(/tổ chức chưa có kết nối ngân hàng/i),
    ).toBeVisible();
  });
});
