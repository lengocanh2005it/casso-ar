import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CustomersPage } from './customers-page';

const apiRequest = vi.fn();
const setParam = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/lib/use-url-query-params', () => ({
  useUrlQueryParams: () => ({
    searchParams: new URLSearchParams(),
    setParam,
    setPage: vi.fn(),
  }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'OWNER' } }),
}));

describe('CustomersPage', () => {
  it('renders a customer row with a link to its detail route', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          id: 'customer-1',
          name: 'Công ty B',
          taxCode: '0100',
          email: null,
          phone: null,
          defaultPaymentTermDays: 30,
          creditLimit: null,
          priority: 1,
          createdAt: '2026-08-01T00:00:00.000Z',
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
          <CustomersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() =>
      expect(screen.getByText('Công ty B')).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('heading', { name: 'Khách hàng' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('searchbox', { name: 'Tìm kiếm khách hàng' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Công ty B' })).toHaveAttribute(
      'href',
      '/customers/customer-1',
    );
  });

  it('replaces the history entry when the search input changes, so fast typing does not drop keystrokes', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(
      screen.getByRole('searchbox', { name: 'Tìm kiếm khách hàng' }),
      { target: { value: 'a' } },
    );

    await waitFor(() => expect(setParam).toHaveBeenCalled());
    expect(setParam).toHaveBeenCalledWith(
      'search',
      expect.any(String),
      expect.objectContaining({ replace: true }),
    );
  });
});
