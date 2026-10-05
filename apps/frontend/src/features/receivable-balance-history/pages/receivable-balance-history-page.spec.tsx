import { Permission } from '@casso-ar/shared-types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { PermissionRoute } from '@/routes/protected-route';
import { formatChartDate } from '../components/receivable-balance-history-charts';
import { ReceivableBalanceHistoryPage } from './receivable-balance-history-page';

const {
  useListMock,
  useSummaryMock,
  exportCsvMock,
  exportDownloadMock,
  isExportingMock,
} = vi.hoisted(() => ({
  useListMock: vi.fn(),
  useSummaryMock: vi.fn(),
  exportCsvMock: vi.fn(),
  exportDownloadMock: vi.fn(),
  isExportingMock: vi.fn(() => false),
}));

vi.mock(
  '@/features/receivable-balance-history/api/use-receivable-balance-history',
  () => ({
    useReceivableBalanceHistory: (...args: unknown[]) => useListMock(...args),
    useReceivableBalanceHistorySummary: (...args: unknown[]) =>
      useSummaryMock(...args),
  }),
);

vi.mock(
  '@/features/receivable-balance-history/api/receivable-balance-history-api',
  () => ({
    exportReceivableBalanceHistoryCsv: (...args: unknown[]) =>
      exportCsvMock(...args),
  }),
);

vi.mock('@/lib/use-csv-export', () => ({
  useCsvExport: () => ({
    isExporting: isExportingMock(),
    exportCsv: async (
      fetchCsv: () => Promise<{ csv: string; truncated?: boolean }>,
      filename: string,
    ) => {
      await fetchCsv();
      exportDownloadMock(fetchCsv, filename);
    },
  }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: vi.fn(),
}));

const useAuthMock = vi.mocked(useAuth);

const listItem = {
  id: 'h-1',
  sequence: 2,
  receivableId: 'rec-1',
  invoiceNumber: 'INV-AUDIT-001',
  customerId: 'cust-1',
  customerName: 'Công ty A',
  status: 'OPEN',
  remainingAmount: 30_000_000,
  effectiveAt: '2026-08-15T04:00:00.000Z',
  changeSource: 'UNDO',
  reasonCode: 'PAYMENT_ALLOCATION_UNDONE',
  actorType: 'USER',
  actorUserId: 'user-1',
  actorDisplayName: 'FM A',
  transitionReferenceId: 'alloc-1',
  note: 'Nhập sai số tiền',
} as const;

const summary = {
  totalTransitions: 4,
  affectedReceivables: 1,
  latestRemainingAmount: 30_000_000,
  dailySeries: [
    { date: '2026-08-13', transitions: 1 },
    { date: '2026-08-14', transitions: 0 },
    { date: '2026-08-15', transitions: 3 },
  ],
  sourceDistribution: [
    { changeSource: 'CREATE', count: 2 },
    { changeSource: 'ALLOCATE', count: 1 },
    { changeSource: 'UNDO', count: 1 },
  ],
};

function renderPage(
  initialEntries: string[] = ['/receivable-balance-history'],
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <ReceivableBalanceHistoryPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function mockLoadedData() {
  useListMock.mockReturnValue({
    data: { items: [listItem], total: 1, page: 1, limit: 20 },
    isLoading: false,
    isError: false,
    error: null,
  });
  useSummaryMock.mockReturnValue({
    data: summary,
    isLoading: false,
    isError: false,
    error: null,
  });
}

describe('ReceivableBalanceHistoryPage', () => {
  beforeAll(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    isExportingMock.mockReturnValue(false);
  });

  it('shows loading skeletons while queries are pending', () => {
    useListMock.mockReturnValue({ isLoading: true });
    useSummaryMock.mockReturnValue({ isLoading: true });

    renderPage();

    expect(screen.getByText('Lịch sử công nợ')).toBeInTheDocument();
  });

  it('shows an error state when the list query fails', () => {
    useListMock.mockReturnValue({ isLoading: false, isError: true });
    useSummaryMock.mockReturnValue({ isLoading: false, isError: false });

    renderPage();

    expect(screen.getByRole('alert')).toHaveTextContent(/không thể tải/i);
  });

  it('shows a loading placeholder while the chart bundle loads', async () => {
    mockLoadedData();

    renderPage();

    expect(screen.getByLabelText('Đang tải biểu đồ')).toBeInTheDocument();
    await screen.findByRole('heading', { name: 'Thay đổi theo ngày' });
  });

  it('uses semantic headings and accessible filter metadata', async () => {
    mockLoadedData();

    renderPage();

    expect(
      await screen.findByRole('heading', { name: 'Thay đổi theo ngày' }),
    ).toBeInTheDocument();
    expect(screen.getByText('4')).toHaveClass('tabular-nums');

    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('name', 'from');
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute(
      'autocomplete',
      'off',
    );
    expect(screen.getByLabelText('Khoản phải thu')).toHaveAttribute(
      'name',
      'receivableId',
    );
    expect(screen.getByLabelText('Khoản phải thu')).toHaveAttribute(
      'placeholder',
      'Nhập mã kỹ thuật khoản phải thu',
    );
  });

  it('shows a visible legend for source distribution', async () => {
    mockLoadedData();

    renderPage();

    expect(await screen.findByText('Tạo mới')).toBeInTheDocument();
    expect(screen.getByText('(2)')).toBeInTheDocument();
  });

  it('formats chart dates for Vietnamese readers', () => {
    expect(formatChartDate('2026-08-13')).toBe('13/08');
  });

  it('announces an export in progress', () => {
    mockLoadedData();
    isExportingMock.mockReturnValue(true);

    renderPage();

    expect(screen.getByRole('button', { name: 'Đang xuất…' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('keeps long table values contained', () => {
    mockLoadedData();

    renderPage();

    // The value now renders inside TruncatedText's own span, which is where
    // the clipping classes live.
    expect(screen.getByText('INV-AUDIT-001')).toHaveClass('truncate');
    expect(screen.getByText('Công ty A')).toHaveClass('truncate');
  });

  it('keeps history controls available when no transitions match', () => {
    useListMock.mockReturnValue({
      data: { items: [], total: 0, page: 1, limit: 20 },
      isLoading: false,
      isError: false,
    });
    useSummaryMock.mockReturnValue({
      data: summary,
      isLoading: false,
      isError: false,
    });

    renderPage();

    expect(screen.getByTestId('empty-state')).toHaveTextContent(
      'Chưa có thay đổi nào trong khoảng thời gian này.',
    );
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeEnabled();
    expect(screen.getByLabelText('Từ ngày')).toHaveAttribute('name', 'from');
    expect(screen.getByLabelText('Nguồn thay đổi')).toBeInTheDocument();
    // A single (empty) page shows no pager at all.
    expect(screen.queryByRole('button', { name: 'Trước' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sau' })).toBeNull();
  });

  it('renders KPIs, charts, rows, detail fields, and pagination from fixtures', () => {
    mockLoadedData();

    renderPage();

    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText('30.000.000 ₫').length).toBeGreaterThan(0);
    expect(screen.getByText('INV-AUDIT-001')).toBeInTheDocument();
    expect(screen.getByText(/FM A/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /chi tiết/i }));
    expect(screen.getByText('alloc-1…')).toBeInTheDocument();
    expect(screen.getByText('Hoàn tác phân bổ thanh toán')).toBeInTheDocument();
    expect(screen.getByText('Nhập sai số tiền')).toBeInTheDocument();
  });

  it('maps URL search params to the query and defaults the date window', () => {
    mockLoadedData();

    renderPage([
      '/receivable-balance-history?status=OPEN&changeSource=UNDO&page=2',
    ]);

    expect(useListMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 20,
        status: 'OPEN',
        changeSource: 'UNDO',
      }),
    );
    const calledWith = useListMock.mock.calls[0][0] as {
      from: string;
      to: string;
    };
    expect(calledWith.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(calledWith.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(useSummaryMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'OPEN', changeSource: 'UNDO' }),
    );
  });

  it('resets the page to 1 when a filter changes', async () => {
    mockLoadedData();

    renderPage(['/receivable-balance-history?page=3']);

    const statusTrigger = screen.getByRole('combobox', { name: /trạng thái/i });
    fireEvent.click(statusTrigger);
    const paidOption = await screen.findByRole('option', { name: 'Đã thu đủ' });
    fireEvent.click(paidOption);

    await waitFor(() =>
      expect(useListMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ page: 1, status: 'PAID' }),
      ),
    );
  });

  it('exports CSV without unsupported actor filters', async () => {
    mockLoadedData();
    exportCsvMock.mockResolvedValue({ csv: 'a', truncated: false });

    renderPage(['/receivable-balance-history?actorType=WEBHOOK']);

    fireEvent.click(screen.getByRole('button', { name: /xuất csv/i }));

    await waitFor(() =>
      expect(exportCsvMock).toHaveBeenCalledWith(
        expect.not.objectContaining({ actorType: expect.anything() }),
      ),
    );
    await waitFor(() =>
      expect(exportDownloadMock).toHaveBeenCalledWith(
        expect.any(Function),
        'receivable-balance-history.csv',
      ),
    );
  });

  it('allows access with the audit read permission for a viewer', () => {
    useAuthMock.mockReturnValue({
      user: { role: 'VIEWER' },
      isLoading: false,
      isAuthenticated: true,
    } as never);
    mockLoadedData();

    const queryClient = new QueryClient();
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/receivable-balance-history']}>
          <PermissionRoute permission={Permission.RECEIVABLE_AUDIT_READ}>
            <ReceivableBalanceHistoryPage />
          </PermissionRoute>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      screen.queryByRole('heading', { name: /403.*không có quyền/i }),
    ).not.toBeInTheDocument();
    expect(useListMock).toHaveBeenCalled();
  });
});
