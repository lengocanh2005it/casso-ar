import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/contexts/auth-context';
import { DashboardPage } from './dashboard-page';

const { apiRequest, getValidAccessToken } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  getValidAccessToken: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: {
    getValidAccessToken,
    hasKnownSession: () => true,
    setAccessToken: vi.fn(),
    resetLogoutState: vi.fn(),
    markLogoutInitiated: vi.fn(),
    clearStaleRefreshSession: vi.fn(),
  },
}));

const summaryData = {
  totalOutstanding: '100000000',
  totalOverdue: '30000000',
  overdueRate: 0.3,
  cashForecast: { forecast7d: '0', forecast14d: '0', forecast30d: '0' },
  topOverdueCustomers: [
    {
      customerId: 'c1',
      customerName: 'Công ty A',
      totalOverdue: '20000000',
    },
  ],
  autoMatchRate: null,
  manualHandlingRate: null,
  reminderEffectiveness: null,
};

const emptyActivity = { items: [], total: 0, page: 1, limit: 10 };

const emptyTrend = { months: 6, items: [] };

function mockApi(
  summary = summaryData,
  role: string | null = null,
  bankingLinked = true,
) {
  getValidAccessToken.mockResolvedValue(role ? 'access-token' : null);
  apiRequest.mockImplementation(({ url }: { url: string }) => {
    if (url === '/api/v1/auth/me' && role) {
      return Promise.resolve({
        id: 'u1',
        email: 'a@b.test',
        role,
        bankingLinked,
      });
    }
    if (url === '/api/v1/bank-transactions/pending-review-count') {
      return Promise.resolve({ count: 7 });
    }
    if (url === '/api/v1/reports/dashboard-summary') {
      return Promise.resolve(summary);
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
  it('shows the full exact report total on its money card', async () => {
    mockApi({ ...summaryData, totalOutstanding: '9007199254740993' });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('9.007.199.254.740.993 ₫')).toBeInTheDocument(),
    );
  });
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('shows KPI cards, the pending-review banner, and top overdue customers once data loads', async () => {
    mockApi();

    renderPage();

    await waitFor(() => expect(screen.getByText('100.000.000 ₫')).toBeTruthy());
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByTestId('header-icon')).toHaveClass('text-primary');
    expect(screen.getByText('7', { selector: 'span' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Xử lý ngay/i })).toBeTruthy();
    expect(screen.getByText('Công ty A')).toBeTruthy();
    expect(screen.getByText('CT')).toHaveClass('shrink-0');

    const trendCard = screen
      .getByText('Xu hướng công nợ 6 tháng')
      .closest('[data-slot="card"]');
    expect(trendCard?.parentElement).toHaveClass(
      'grid',
      'xl:grid-cols-[1.25fr_0.75fr]',
    );
  });

  it('applies the selected range to both dashboard trend charts', async () => {
    mockApi();

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Xu hướng công nợ 6 tháng')).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('combobox', { name: 'Khoảng thời gian' }));
    fireEvent.click(await screen.findByRole('option', { name: '3 tháng' }));

    await waitFor(() => {
      const trendCalls = apiRequest.mock.calls.filter(
        ([options]) =>
          (options as { url: string }).url === '/api/v1/reports/trend',
      );
      const last = trendCalls.at(-1)?.[0] as { params: object } | undefined;
      expect(last?.params).toMatchObject({ months: 3 });
    });
    expect(screen.getByText('Xu hướng công nợ 3 tháng')).toBeTruthy();
    expect(screen.getByText('Hoạt động thanh toán 3 tháng')).toBeTruthy();
    expect(
      screen.getByText(
        'Tổng số tiền đã thu theo từng tháng trong 3 tháng gần nhất',
      ),
    ).toBeTruthy();
  });

  it('does not spend a full-width banner on a welcome-back line', async () => {
    mockApi();

    renderPage();

    await waitFor(() => expect(screen.getByText('100.000.000 ₫')).toBeTruthy());
    // Brand-new organizations were greeted with "đã quay trở lại!" too.
    expect(screen.queryByText(/quay trở lại/)).not.toBeInTheDocument();
    expect(
      screen.queryByText('Bắt đầu theo dõi công nợ'),
    ).not.toBeInTheDocument();
  });

  const newOrgSummary = {
    ...summaryData,
    totalOutstanding: '0',
    totalOverdue: '0',
    overdueRate: 0,
    topOverdueCustomers: [],
  };

  it('hides the getting-started steps from roles that cannot import', async () => {
    mockApi(newOrgSummary, 'VIEWER');

    renderPage();

    expect(await screen.findByText('Chưa có công nợ')).toBeInTheDocument();
    expect(
      screen.queryByText('Bắt đầu theo dõi công nợ'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('guides a brand-new organization to import its first invoices', async () => {
    mockApi(newOrgSummary, 'OWNER');

    renderPage();

    expect(
      await screen.findByText('Bắt đầu theo dõi công nợ'),
    ).toBeInTheDocument();
    // Import is the only way to create customers, so it is step one.
    expect(
      screen.getByRole('link', { name: /Nhập hóa đơn từ file/ }),
    ).toHaveAttribute('href', '/receivables');
    expect(
      screen.getByRole('link', { name: /Đối soát tiền về/ }),
    ).toHaveAttribute('href', '/exceptions');
    expect(
      screen.queryByRole('link', { name: /Kết nối ngân hàng/ }),
    ).not.toBeInTheDocument();
  });

  it('asks a brand-new organization without a bank connection to connect one first', async () => {
    mockApi(newOrgSummary, 'OWNER', false);

    renderPage();

    expect(
      await screen.findByText('Bắt đầu theo dõi công nợ'),
    ).toBeInTheDocument();
    // It used to claim "Tài khoản ngân hàng đã kết nối" right under the
    // "no active bank connection" banner.
    expect(
      screen.queryByText(/Tài khoản ngân hàng đã kết nối/),
    ).not.toBeInTheDocument();
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.closest('ol'));
    expect(links[0]).toHaveAccessibleName(/Kết nối ngân hàng/);
    expect(links[0]).toHaveAttribute('href', '/bank-connections');
  });

  it('uses the shared empty state when there are no overdue customers', async () => {
    mockApi({ ...summaryData, topOverdueCustomers: [] });

    renderPage();

    await waitFor(() =>
      expect(screen.getByText('Chưa có khách hàng quá hạn')).toBeTruthy(),
    );
    expect(
      screen.getByText(
        'Danh sách sẽ xuất hiện khi có khoản quá hạn cần theo dõi.',
      ),
    ).toBeTruthy();
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
