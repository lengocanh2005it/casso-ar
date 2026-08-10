import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReceivableDetailPage } from './receivable-detail-page';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'FINANCE_MANAGER' } }),
}));

describe('ReceivableDetailPage', () => {
  it('shows remaining amount and allocations', async () => {
    apiRequest.mockResolvedValue({
      id: 'r1',
      customerId: 'c1',
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

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/receivables/r1']}>
          <Routes>
            <Route path="/receivables/:id" element={<ReceivableDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('20.000.000 ₫')).toBeInTheDocument(),
    );
    expect(screen.getAllByText('30.000.000 ₫')).toHaveLength(2);
  });
});
