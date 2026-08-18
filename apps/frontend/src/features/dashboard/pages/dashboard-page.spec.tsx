import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { DashboardPage } from './dashboard-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: {
    getValidAccessToken: vi.fn().mockResolvedValue(null),
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
}));

const summaryData = {
  totalOutstanding: 100_000_000,
  totalOverdue: 30_000_000,
  overdueRate: 0.3,
  cashForecast: { forecast7d: 0, forecast14d: 0, forecast30d: 0 },
  topOverdueCustomers: [
    {
      customerId: 'c1',
      customerName: 'Công ty A',
      totalOverdue: 20_000_000,
    },
  ],
  autoMatchRate: null,
  manualHandlingRate: null,
  reminderEffectiveness: null,
};

const emptyActivity = { items: [], total: 0, page: 1, limit: 10 };

const emptyTrend = { months: 6, items: [] };

function mockApi() {
  apiRequest.mockImplementation(({ url }: { url: string }) => {
    if (url === '/api/v1/bank-transactions/pending-review-count') {
      return Promise.resolve({ count: 7 });
    }
    if (url === '/api/v1/reports/dashboard-summary') {
      return Promise.resolve(summaryData);
    }
    if (url === '/api/v1/reports/trend') {
      return Promise.resolve(emptyTrend);
    }
    if (url === '/api/v1/activity') {
      return Promise.resolve(emptyActivity);
    }
    return Promise.reject(new Error(`unexpected url ${url}`));
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe('DashboardPage', () => {
  it('shows KPI cards, the pending-review banner, and top overdue customers once data loads', async () => {
    mockApi();

    renderPage();

    await waitFor(() => expect(screen.getByText('100.000.000 ₫')).toBeTruthy());
    expect(screen.getByText('7', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xử lý ngay/i })).toBeTruthy();
    expect(screen.getByText('Công ty A')).toBeTruthy();
  });

  it('offers a retry action when the summary fails to load', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/reports/dashboard-summary') {
        return Promise.reject(new Error('boom'));
      }
      if (url === '/api/v1/reports/trend') {
        return Promise.resolve(emptyTrend);
      }
      if (url === '/api/v1/activity') {
        return Promise.resolve(emptyActivity);
      }
      return Promise.resolve({ count: 0 });
    });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Không thể tải dữ liệu tổng quan.')).toBeTruthy(),
    );

    const retry = screen.getByRole('button', { name: 'Thử lại' });
    const callsBefore = apiRequest.mock.calls.filter(
      ([arg]) => arg.url === '/api/v1/reports/dashboard-summary',
    ).length;

    retry.click();
    await waitFor(() =>
      expect(
        apiRequest.mock.calls.filter(
          ([arg]) => arg.url === '/api/v1/reports/dashboard-summary',
        ).length,
      ).toBe(callsBefore + 1),
    );
  });

  it('surfaces a review-count load failure instead of hiding the banner', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/bank-transactions/pending-review-count') {
        return Promise.reject(new Error('boom'));
      }
      if (url === '/api/v1/reports/trend') {
        return Promise.resolve(emptyTrend);
      }
      if (url === '/api/v1/activity') {
        return Promise.resolve(emptyActivity);
      }
      return Promise.resolve(summaryData);
    });

    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Không thể tải số lượng cần đối soát.'),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole('link', { name: /Xử lý ngay/i })).toBeNull();
  });

  it('announces loading through a live region while data is pending', () => {
    apiRequest.mockImplementation(() => new Promise(() => {}));

    renderPage();

    const statuses = screen.getAllByRole('status');
    expect(statuses.length).toBeGreaterThanOrEqual(1);
    for (const status of statuses) {
      expect(status).toHaveAccessibleName('Đang tải dữ liệu');
    }
  });

  it('shows skeleton placeholders instead of raw text while data is pending', () => {
    apiRequest.mockImplementation(() => new Promise(() => {}));

    const { container } = renderPage();

    expect(
      container.querySelectorAll('[data-slot="skeleton"]').length,
    ).toBeGreaterThanOrEqual(6);
    expect(screen.queryByText('Đang tải…')).toBeNull();
  });
});
