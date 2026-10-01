import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerDetailPage } from './customer-detail-page';

const apiRequest = vi.fn();
const postWithIdempotency = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

describe('CustomerDetailPage', () => {
  beforeEach(() => {
    apiRequest.mockReset();
    postWithIdempotency.mockReset();
  });

  it('loads the customer profile on a direct detail route', async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Công ty B',
        taxCode: '0100',
        email: 'b@example.com',
        phone: '0900000000',
        defaultPaymentTermDays: 30,
        creditLimit: 100_000_000,
        priority: 1,
        createdAt: '2026-08-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 20 })
      .mockResolvedValueOnce({
        customerId: 'customer-1',
        totalAvailableAmount: 0,
        items: [],
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'receivable-1',
            customerId: 'customer-1',
            customerName: 'Công ty B',
            invoiceId: 'invoice-1',
            invoiceNumber: 'INV-2026-001',
            originalAmount: 500_000,
            paidAmount: 0,
            remainingAmount: 500_000,
            dueDate: '2026-09-01',
            status: 'OPEN',
            isDisputed: false,
            disputeId: null,
            isOverdue: false,
            salesRepresentativeId: null,
            createdAt: '2026-08-01T00:00:00.000Z',
            closedAt: null,
          },
        ],
        total: 1,
        page: 1,
        limit: 100,
      })
      .mockResolvedValueOnce({
        items: [
          {
            id: 'account-1',
            customerId: 'customer-1',
            accountNumberMasked: '******2233',
            isActive: true,
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
        total: 1,
      });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/customers/customer-1']}>
          <Routes>
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('Công ty B')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'Công ty B' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/b@example\.com/)).toBeInTheDocument();
    expect(
      await screen.findByText(/Tài khoản ngân hàng của khách/),
    ).toBeInTheDocument();
    expect(screen.getByText('******2233')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'INV-2026-001' })).toHaveAttribute(
      'href',
      '/receivables/receivable-1',
    );

    const contactCard = screen
      .getByText('Thông tin liên hệ')
      .closest('[data-slot="card"]');
    // Container query, not sm: the card is only ~220px wide at a 768px
    // viewport (256px sidebar), where a viewport-based two-column grid
    // truncates the email and the credit limit.
    expect(
      contactCard?.querySelector('[data-slot="card-content"]'),
    ).toHaveClass('grid', '@container', '@md/grid-cols-2');

    // Two independent stacks (main: receivables + activity, side: credit +
    // bank accounts) so a short card never stretches to its neighbour's
    // height and leaves a blank block.
    const card = (text: string | RegExp) =>
      screen.getByText(text).closest('[data-slot="card"]');
    const mainStack = card('Khoản phải thu')?.parentElement;
    const sideStack = card(/Tài khoản ngân hàng của khách/)?.parentElement;
    expect(card('Lịch sử hoạt động')?.parentElement).toBe(mainStack);
    expect(card('Số dư tín dụng')?.parentElement).toBe(sideStack);
    expect(mainStack?.parentElement).toBe(sideStack?.parentElement);
    expect(mainStack?.parentElement).toHaveClass('grid', 'xl:grid-cols-3');

    // Receivable rows say what the amount is and when it is due.
    const row = screen
      .getByRole('link', { name: 'INV-2026-001' })
      .closest('li');
    expect(row).toHaveTextContent('Còn lại');
    expect(row).toHaveTextContent('Hạn 01/09/2026');
    expect(screen.getByRole('link', { name: 'Khách hàng' })).toHaveAttribute(
      'href',
      '/customers',
    );
  });

  it('shows an allocation action for each unapplied payment', async () => {
    apiRequest
      .mockResolvedValueOnce({
        id: 'customer-1',
        name: 'Công ty B',
        taxCode: null,
        email: null,
        phone: null,
        defaultPaymentTermDays: 30,
        creditLimit: null,
        priority: null,
        createdAt: '2026-08-01T00:00:00.000Z',
      })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 20 })
      .mockResolvedValueOnce({
        customerId: 'customer-1',
        totalAvailableAmount: 500_000,
        items: [
          {
            paymentId: 'payment-1',
            totalAmount: 500_000,
            allocatedAmount: 0,
            unallocatedAmount: 500_000,
            payerName: 'Công ty B',
            receivedAt: '2026-08-01T00:00:00.000Z',
          },
        ],
      })
      .mockResolvedValueOnce({ items: [], total: 0, page: 1, limit: 100 })
      .mockResolvedValueOnce({ items: [], total: 0 });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/customers/customer-1']}>
          <Routes>
            <Route path="/customers/:id" element={<CustomerDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Phân bổ payment-1' }),
      ).toBeInTheDocument(),
    );
  });
});
