import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/App';
import { AuthProvider } from '@/contexts/auth-context';
import { ThemeProvider } from '@/contexts/theme-context';

const { getValidAccessToken, apiRequest } = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  apiRequest: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  API_BASE_URL: '',
  authTokenManager: {
    getValidAccessToken,
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
  apiRequest,
}));

vi.mock('@/features/exceptions/api/use-review-count', () => ({
  useReviewCount: () => ({ data: 0 }),
}));

describe('application routes', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
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
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
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
        screen.getByRole('heading', { name: /casso admin/i }),
      ).toBeVisible(),
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

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
              <AppRoutes />
            </MemoryRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );

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

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <AuthProvider>
            <MemoryRouter initialEntries={['/']}>
              <AppRoutes />
            </MemoryRouter>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(
      () =>
        expect(
          screen.getByRole('heading', { name: 'Trang chủ' }),
        ).toBeVisible(),
      { timeout: 5_000 },
    );
  }, 15_000);

  it('redirects an authenticated organization without a bank link to onboarding', async () => {
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

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/dashboard']}>
          <AppRoutes />
        </MemoryRouter>
      </AuthProvider>,
    );

    await waitFor(
      () => expect(screen.getByText('Liên kết ngân hàng')).toBeVisible(),
      { timeout: 15_000 },
    );
  }, 20_000);
});
