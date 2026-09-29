import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { useAuth } from '@/contexts/auth-context';
import { ReceivableDetailPage } from './receivable-detail-page';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/contexts/auth-context', () => ({ useAuth: vi.fn() }));

const useAuthMock = vi.mocked(useAuth);

function renderDetailPage(id = 'r1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/receivables/${id}`]}>
        <Routes>
          <Route path="/receivables/:id" element={<ReceivableDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ReceivableDetailPage', () => {
  it('shows remaining amount and allocations', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'FINANCE_MANAGER' },
    } as never);
    apiRequest.mockResolvedValue({
      id: 'r1',
      customerId: 'c1',
      customerName: 'Công ty Minh Long',
      invoiceId: null,
      invoiceNumber: null,
      originalAmount: 50_000_000,
      paidAmount: 30_000_000,
      remainingAmount: 20_000_000,
      dueDate: '2026-08-20',
      status: 'PARTIALLY_PAID',
      isDisputed: false,
      disputeId: null,
      isOverdue: true,
      salesRepresentativeId: null,
      createdAt: '2026-07-01',
      allocations: [
        {
          id: 'pa1',
          paymentId: 'p1',
          allocatedAmount: 30_000_000,
          allocatedAt: '2026-08-01',
          allocatedByUserId: null,
        },
      ],
    });

    renderDetailPage();

    await waitFor(() =>
      expect(screen.getByText('20.000.000 ₫')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'Khoản phải thu' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Không có hóa đơn')).toBeInTheDocument();
    expect(screen.getByText('Công ty Minh Long')).toBeInTheDocument();
    expect(screen.queryByText('#r1')).not.toBeInTheDocument();
    expect(screen.queryByTitle('r1')).not.toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      '60',
    );
    expect(screen.getByText('60% đã thu')).toBeInTheDocument();
    expect(screen.getAllByText('30.000.000 ₫')).toHaveLength(2);
  });

  it('identifies the receivable by customer and due date right under the title', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'FINANCE_MANAGER' },
    } as never);
    apiRequest.mockResolvedValue({
      id: 'r1',
      customerId: 'c1',
      customerName: 'Công ty Minh Long',
      invoiceId: null,
      invoiceNumber: null,
      originalAmount: 50_000_000,
      paidAmount: 30_000_000,
      remainingAmount: 20_000_000,
      dueDate: '2026-08-20',
      status: 'PARTIALLY_PAID',
      isDisputed: false,
      disputeId: null,
      isOverdue: true,
      salesRepresentativeId: null,
      createdAt: '2026-07-01',
      allocations: [],
    });

    renderDetailPage();

    // A title of just "Khoản phải thu" could not tell two receivables apart.
    expect(
      await screen.findByRole('link', { name: 'Công ty Minh Long' }),
    ).toHaveAttribute('href', '/customers/c1');
    expect(screen.getByText('Hạn 20/08/2026')).toHaveClass('text-destructive');
    expect(screen.getByRole('link', { name: 'Công nợ' })).toHaveAttribute(
      'href',
      '/receivables',
    );
    // The separate progress card repeated every amount from the summary.
    expect(screen.getAllByText(/50\.000\.000 ₫/)).toHaveLength(1);
    expect(
      screen.getByRole('button', { name: 'Hủy khoản phải thu' }),
    ).toBeInTheDocument();
  });

  it('shows the invoice number as heading instead of the raw id when available', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'FINANCE_MANAGER' },
    } as never);
    apiRequest.mockResolvedValue({
      id: 'a1b2c3d4-e5f6-47a8-9abc-1234567890ab',
      customerId: 'c1',
      invoiceId: 'inv1',
      invoiceNumber: 'INV-001',
      originalAmount: 50_000_000,
      paidAmount: 0,
      remainingAmount: 50_000_000,
      dueDate: '2026-08-20',
      status: 'OPEN',
      isDisputed: false,
      disputeId: null,
      isOverdue: false,
      salesRepresentativeId: null,
      createdAt: '2026-07-01',
      allocations: [],
    });

    renderDetailPage('a1b2c3d4-e5f6-47a8-9abc-1234567890ab');

    expect(
      await screen.findByRole('heading', { name: 'INV-001' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Chưa có khoản thanh toán')).toBeInTheDocument();
    expect(
      screen.queryByText('a1b2c3d4-e5f6-47a8-9abc-1234567890ab'),
    ).not.toBeInTheDocument();
  });

  it('shows the audit trail tab for a role with AUDIT_LOG_READ', async () => {
    useAuthMock.mockReturnValue({
      user: { role: 'FINANCE_MANAGER' },
    } as never);
    apiRequest.mockResolvedValue({
      id: 'r1',
      customerId: 'c1',
      invoiceId: null,
      invoiceNumber: null,
      originalAmount: 50_000_000,
      paidAmount: 0,
      remainingAmount: 50_000_000,
      dueDate: '2026-08-20',
      status: 'OPEN',
      isDisputed: false,
      disputeId: null,
      isOverdue: false,
      salesRepresentativeId: null,
      createdAt: '2026-07-01',
      allocations: [],
    });

    renderDetailPage();

    expect(
      await screen.findByRole('tab', { name: 'Nhật ký kiểm toán' }),
    ).toBeInTheDocument();
  });

  it('hides the audit trail tab for a role without AUDIT_LOG_READ', async () => {
    // ACCOUNTANT has neither AUDIT_LOG_READ nor RECEIVABLE_AUDIT_READ — see
    // packages/shared-types/src/role-permissions.ts.
    useAuthMock.mockReturnValue({
      user: { role: 'ACCOUNTANT' },
    } as never);
    apiRequest.mockResolvedValue({
      id: 'r1',
      customerId: 'c1',
      invoiceId: null,
      invoiceNumber: null,
      originalAmount: 50_000_000,
      paidAmount: 0,
      remainingAmount: 50_000_000,
      dueDate: '2026-08-20',
      status: 'OPEN',
      isDisputed: false,
      disputeId: null,
      isOverdue: false,
      salesRepresentativeId: null,
      createdAt: '2026-07-01',
      allocations: [],
    });

    renderDetailPage();

    await screen.findByRole('heading', { name: 'Khoản phải thu' });
    expect(
      screen.queryByRole('tab', { name: 'Nhật ký kiểm toán' }),
    ).not.toBeInTheDocument();
  });
});
