import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CustomerDetailPage } from './customer-detail-page';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

describe('CustomerDetailPage', () => {
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
        items: [],
        total: 0,
        page: 1,
        limit: 20,
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
    expect(screen.getByText(/b@example\.com/)).toBeInTheDocument();
  });
});
