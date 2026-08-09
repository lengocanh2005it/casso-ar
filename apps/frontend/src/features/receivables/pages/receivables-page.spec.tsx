import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ReceivablesPage } from './receivables-page';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
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
    expect(screen.getByText('15.000.000 ₫')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'INV-001' })).toHaveAttribute(
      'href',
      '/receivables/receivable-1',
    );
  });
});
