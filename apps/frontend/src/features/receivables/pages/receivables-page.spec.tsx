import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReceivablesPage } from './receivables-page';

const apiRequest = vi.fn();
const apiRequestWithHeaders = vi.fn();
const downloadCsv = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  apiRequestWithHeaders: (...args: unknown[]) => apiRequestWithHeaders(...args),
}));

vi.mock('@/lib/download-csv', () => ({
  downloadCsv: (...args: unknown[]) => downloadCsv(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

describe('ReceivablesPage', () => {
  it('renders receivable amounts and links to detail', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          id: 'receivable-1',
          customerId: 'customer-1',
          invoiceId: 'invoice-1',
          invoiceNumber: 'INV-001',
          originalAmount: 20_000_000,
          paidAmount: 5_000_000,
          remainingAmount: 15_000_000,
          dueDate: '2026-08-20T00:00:00.000Z',
          status: 'PARTIALLY_PAID',
          salesRepresentativeId: null,
          createdAt: '2026-08-01T00:00:00.000Z',
          closedAt: null,
          isOverdue: false,
          isDisputed: false,
          disputeId: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('INV-001')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'Công nợ' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Tìm kiếm công nợ' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'Lọc theo trạng thái' }),
    ).toBeInTheDocument();
    expect(screen.getByText('15.000.000 ₫')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'INV-001' })).toHaveAttribute(
      'href',
      '/receivables/receivable-1',
    );
  });

  it('keeps the current page and pagination on screen while the next page loads', async () => {
    apiRequest.mockReset();
    apiRequest
      .mockResolvedValueOnce({
        items: [
          {
            id: 'receivable-1',
            customerId: 'customer-1',
            invoiceId: 'invoice-1',
            invoiceNumber: 'INV-001',
            originalAmount: 20_000_000,
            paidAmount: 0,
            remainingAmount: 20_000_000,
            dueDate: '2026-08-20T00:00:00.000Z',
            status: 'OPEN',
            salesRepresentativeId: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            closedAt: null,
            isOverdue: false,
            isDisputed: false,
            disputeId: null,
          },
        ],
        total: 40,
        page: 1,
        limit: 20,
      })
      .mockReturnValueOnce(new Promise(() => {}));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText('Trang 1 / 2 · 40 khoản phải thu'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(screen.getByText('INV-001')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sau' })).toBeInTheDocument();
    // The pager follows the requested page, not the placeholder's page,
    // so a second "Sau" moves on instead of re-requesting page 2.
    expect(
      screen.getByText('Trang 2 / 2 · 40 khoản phải thu'),
    ).toBeInTheDocument();
    expect(screen.getByText('INV-001').closest('[aria-busy]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    // Dimmed rows belong to the previous page/filter: not actionable.
    expect(screen.getByText('INV-001').closest('[aria-busy]')).toHaveAttribute(
      'inert',
    );
  });

  it('does not flash the "no receivables yet" state while an empty search is cleared', async () => {
    apiRequest.mockReset();
    apiRequest
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 20 })
      .mockReturnValueOnce(new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/receivables?search=zzz']}>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(
      await screen.findByText('Không có khoản phải thu phù hợp'),
    ).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Tìm kiếm công nợ' }),
      {
        target: { value: '' },
      },
    );

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    // The placeholder is the old (filtered, empty) result; judged against
    // the new, unfiltered state it read as "this org has no receivables".
    expect(
      screen.queryByText('Chưa có khoản phải thu nào'),
    ).not.toBeInTheDocument();
  });

  it('drops the bulk selection while the next page loads', async () => {
    apiRequest.mockReset();
    apiRequest
      .mockResolvedValueOnce({
        items: [
          {
            id: 'receivable-1',
            customerId: 'customer-1',
            invoiceId: 'invoice-1',
            invoiceNumber: 'INV-001',
            originalAmount: 20_000_000,
            paidAmount: 0,
            remainingAmount: 20_000_000,
            dueDate: '2026-08-20T00:00:00.000Z',
            status: 'OPEN',
            salesRepresentativeId: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            closedAt: null,
            isOverdue: false,
            isDisputed: false,
            disputeId: null,
          },
        ],
        total: 40,
        page: 1,
        limit: 20,
      })
      .mockReturnValueOnce(new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    fireEvent.click(
      await screen.findByRole('checkbox', { name: 'Chọn INV-001' }),
    );
    expect(await screen.findByText('Đã chọn 1')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Sau' }));

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    // The dimmed rows are inert, but the bar below them could still write
    // off / cancel the previous page's rows under the new page or filter.
    await waitFor(() =>
      expect(screen.queryByText('Đã chọn 1')).not.toBeInTheDocument(),
    );
  });

  it('exports the current filters as CSV', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    apiRequestWithHeaders.mockResolvedValue({
      data: 'a,b\n1,2',
      headers: {},
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Xuất CSV' }));

    await waitFor(() =>
      expect(apiRequestWithHeaders).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables/export',
          method: 'GET',
        }),
      ),
    );
    expect(downloadCsv).toHaveBeenCalledWith('a,b\n1,2', 'cong-no.csv');
  });

  it('sends the search box value as a search filter', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(
      await screen.findByPlaceholderText('Tìm số hóa đơn, khách hàng…'),
      { target: { value: 'acme' } },
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/receivables',
          params: expect.objectContaining({ search: 'acme' }),
        }),
      ),
    );
    // A search that matches nothing is a filtered empty result, not "no data".
    expect(
      await screen.findByText('Không có khoản phải thu phù hợp'),
    ).toBeInTheDocument();
  });

  it('explains how to recover when loading receivables fails', async () => {
    apiRequest.mockRejectedValue(new Error('network'));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ReceivablesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'Không thể tải danh sách công nợ. Vui lòng thử lại.',
      ),
    ).toBeInTheDocument();
  });
});
