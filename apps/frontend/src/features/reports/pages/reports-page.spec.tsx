import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPage } from './reports-page';

const { apiRequest } = vi.hoisted(() => ({ apiRequest: vi.fn() }));
const downloadCsv = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  authTokenManager: { getValidAccessToken: vi.fn().mockResolvedValue('t') },
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));
vi.mock('@/lib/download-csv', () => ({
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
}));

function mockReports(
  topOverdueCustomers: Array<{
    customerId: string;
    customerName: string;
    totalOverdue: number;
  }> = [],
) {
  apiRequest.mockImplementation(({ url }: { url: string }) => {
    if (url === '/api/v1/reports/dashboard-summary') {
      return Promise.resolve({
        totalOutstanding: 100_000_000,
        totalOverdue: 30_000_000,
        overdueRate: 0.3,
        cashForecast: {
          forecast7d: 10_000_000,
          forecast14d: 20_000_000,
          forecast30d: 30_000_000,
        },
        topOverdueCustomers,
        autoMatchRate: 0.8,
        manualHandlingRate: 0.2,
        reminderEffectiveness: 0.5,
      });
    }
    if (url === '/api/v1/reports/aging') {
      return Promise.resolve({
        buckets: [
          { bucket: 'NOT_DUE', count: 3, totalRemaining: 70_000_000 },
          { bucket: 'OVERDUE_1_7', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_8_30', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_31_60', count: 0, totalRemaining: 0 },
          { bucket: 'OVERDUE_60_PLUS', count: 1, totalRemaining: 30_000_000 },
        ],
      });
    }
    if (url === '/api/v1/reports/aging/customers') {
      return Promise.resolve({
        items: [
          {
            customerId: 'cust-1',
            customerName: 'ACME Corp',
            taxCode: '0101234567',
            buckets: [
              { bucket: 'NOT_DUE', totalRemaining: 0 },
              { bucket: 'OVERDUE_1_7', totalRemaining: 1_500_000 },
              { bucket: 'OVERDUE_8_30', totalRemaining: 2_000_000 },
              { bucket: 'OVERDUE_31_60', totalRemaining: 3_000_000 },
              { bucket: 'OVERDUE_60_PLUS', totalRemaining: 4_900_000 },
            ],
            totalRemaining: 11_400_000,
          },
        ],
        total: 1,
        page: 1,
        limit: 20,
      });
    }
    if (url === '/api/v1/reports/aging/export') {
      return Promise.resolve('bucket,count\nNOT_DUE,3');
    }
    if (url === '/api/v1/reports/trend') {
      return Promise.resolve({
        months: 12,
        items: [
          { month: '2026-06', outstanding: null, collected: 0 },
          { month: '2026-07', outstanding: 4_000_000, collected: 3_000_000 },
          { month: '2026-08', outstanding: 7_000_000, collected: 5_000_000 },
        ],
      });
    }
    return Promise.reject(new Error(`unexpected request: ${url}`));
  });
}

function renderPage(initialEntries: string[] = ['/reports']) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <QueryClientProvider client={queryClient}>
        <ReportsPage />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

function customerAgingCalls() {
  return apiRequest.mock.calls.filter(
    ([options]) =>
      (options as { url: string }).url === '/api/v1/reports/aging/customers',
  );
}

describe('ReportsPage', () => {
  beforeEach(() => {
    apiRequest.mockClear();
    downloadCsv.mockClear();
  });

  beforeAll(() => {
    // jsdom does not implement scrollIntoView; radix Select calls it when
    // focusing the selected option.
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('renders aging buckets with formatted amounts and a total row', async () => {
    mockReports();
    renderPage();

    await waitFor(() => expect(screen.getByText('70.000.000 ₫')).toBeTruthy());
    expect(
      screen.getByRole('heading', { name: 'Báo cáo' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Phân bổ tuổi nợ')).toBeInTheDocument();
    expect(screen.getByText('Công nợ theo khách hàng')).toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getAllByText(/100.000.000 ₫/).length,
      ).toBeGreaterThanOrEqual(2),
    );
    expect(screen.getAllByText('Quá hạn 31–60 ngày').length).toBeGreaterThan(0);
  });

  it('exports the aging report as CSV', async () => {
    mockReports();
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Xuất CSV' }));

    await waitFor(() =>
      expect(downloadCsv).toHaveBeenCalledWith(
        'bucket,count\nNOT_DUE,3',
        'bao-cao-tuoi-no.csv',
      ),
    );
  });

  it('renders customer identity, five bucket amounts, and total remaining', async () => {
    mockReports();
    renderPage();

    await waitFor(() => expect(screen.getByText('ACME Corp')).toBeTruthy());
    expect(screen.getByText('0101234567')).toBeTruthy();
    expect(screen.getAllByText('Chưa đến hạn').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quá hạn 1–7 ngày').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quá hạn 8–30 ngày').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quá hạn 31–60 ngày').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Quá hạn trên 60 ngày').length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText('1.500.000 ₫')).toBeTruthy();
    expect(screen.getByText('4.900.000 ₫')).toBeTruthy();
    expect(screen.getByText('11.400.000 ₫')).toBeTruthy();
  });

  it('uses the same customer avatar in the overdue ranking', async () => {
    mockReports([
      {
        customerId: 'cust-overdue',
        customerName: 'Công ty A',
        totalOverdue: 20_000_000,
      },
    ]);
    renderPage();

    await waitFor(() => expect(screen.getByText('Công ty A')).toBeTruthy());
    expect(screen.getByText('CT')).toHaveClass('shrink-0');
  });

  it('sends URL search and bucket values and resets page on filter change', async () => {
    mockReports();
    renderPage(['/reports?agingPage=3']);

    await waitFor(() => {
      expect(customerAgingCalls().length).toBeGreaterThanOrEqual(1);
      const last = customerAgingCalls().at(-1)?.[0] as
        | { params: object }
        | undefined;
      expect(last?.params).toMatchObject({ page: 3 });
    });

    const searchInput = screen.getByRole('textbox', { name: 'Tìm khách hàng' });
    fireEvent.change(searchInput, { target: { value: 'ACME' } });

    await waitFor(() => {
      const last = customerAgingCalls().at(-1)?.[0] as { params: object };
      expect(last.params).toMatchObject({ page: 1, search: 'ACME' });
    });

    fireEvent.click(screen.getByRole('combobox', { name: 'Bộ lọc tuổi nợ' }));
    fireEvent.click(
      await screen.findByRole('option', { name: 'Quá hạn trên 60 ngày' }),
    );

    await waitFor(() => {
      const last = customerAgingCalls().at(-1)?.[0] as { params: object };
      expect(last.params).toMatchObject({
        page: 1,
        bucket: 'OVERDUE_60_PLUS',
      });
    });
  });

  it('renders the trend chart, both series, and a 3/6/12 preset selector', async () => {
    mockReports();
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Một số tháng trước thời điểm theo dõi lịch sử chưa có dữ liệu công nợ.',
        ),
      ).toBeTruthy(),
    );
    expect(
      screen.getByRole('img', { name: 'Biểu đồ xu hướng công nợ và thu hồi' }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        'Tháng hiện tại là số liệu tạm thời đến thời điểm hiện tại.',
      ),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('combobox', { name: 'Khoảng thời gian' }));
    expect(await screen.findByRole('option', { name: '3 tháng' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '6 tháng' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '12 tháng' })).toBeTruthy();
  });

  it('keeps null outstanding points as unavailable rather than zero', async () => {
    mockReports();
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText(
          'Một số tháng trước thời điểm theo dõi lịch sử chưa có dữ liệu công nợ.',
        ),
      ).toBeTruthy(),
    );
    expect(
      screen.getByRole('img', { name: 'Biểu đồ xu hướng công nợ và thu hồi' }),
    ).toBeTruthy();
  });

  it('persists the selected trend preset in the URL', async () => {
    mockReports();
    renderPage();

    fireEvent.click(
      await screen.findByRole('combobox', { name: 'Khoảng thời gian' }),
    );
    fireEvent.click(await screen.findByRole('option', { name: '3 tháng' }));

    await waitFor(() => {
      const trendCalls = apiRequest.mock.calls.filter(
        ([options]) =>
          (options as { url: string }).url === '/api/v1/reports/trend',
      );
      const last = trendCalls.at(-1)?.[0] as { params: object };
      expect(last.params).toMatchObject({ months: 3 });
    });
  });

  it('renders empty and error states for customer aging', async () => {
    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/reports/aging/customers') {
        return Promise.resolve({ items: [], total: 0, page: 1, limit: 20 });
      }
      if (url === '/api/v1/reports/dashboard-summary') {
        return Promise.resolve({
          totalOutstanding: 0,
          totalOverdue: 0,
          overdueRate: 0,
          cashForecast: { forecast7d: 0, forecast14d: 0, forecast30d: 0 },
          topOverdueCustomers: [],
          autoMatchRate: null,
          manualHandlingRate: null,
          reminderEffectiveness: null,
        });
      }
      if (url === '/api/v1/reports/aging') {
        return Promise.resolve({ buckets: [] });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Không có khách hàng có công nợ hiện tại'),
      ).toBeTruthy(),
    );

    apiRequest.mockImplementation(({ url }: { url: string }) => {
      if (url === '/api/v1/reports/aging/customers') {
        return Promise.reject(new Error('boom'));
      }
      if (url === '/api/v1/reports/dashboard-summary') {
        return Promise.resolve({
          totalOutstanding: 0,
          totalOverdue: 0,
          overdueRate: 0,
          cashForecast: { forecast7d: 0, forecast14d: 0, forecast30d: 0 },
          topOverdueCustomers: [],
          autoMatchRate: null,
          manualHandlingRate: null,
          reminderEffectiveness: null,
        });
      }
      if (url === '/api/v1/reports/aging') {
        return Promise.resolve({ buckets: [] });
      }
      return Promise.reject(new Error(`unexpected request: ${url}`));
    });
    renderPage();

    await waitFor(() =>
      expect(
        screen.getByText('Không thể tải báo cáo công nợ khách hàng.'),
      ).toBeTruthy(),
    );
  });

  it('resets an out-of-range customer aging page instead of showing a false empty state', async () => {
    mockReports();
    const defaultImplementation = apiRequest.getMockImplementation();
    apiRequest.mockImplementation(
      ({ url, params }: { url: string; params?: { page?: number } }) => {
        if (url === '/api/v1/reports/aging/customers' && params?.page === 3) {
          return Promise.resolve({ items: [], total: 2, page: 3, limit: 20 });
        }
        return defaultImplementation?.({ url, params });
      },
    );
    renderPage(['/reports?agingPage=3']);

    await waitFor(() => {
      expect(
        customerAgingCalls().some(
          ([options]) =>
            (options as { params: { page: number } }).params.page === 1,
        ),
      ).toBe(true);
    });
    expect(
      screen.queryByText('Không có khách hàng có công nợ hiện tại'),
    ).toBeNull();
  });
});
