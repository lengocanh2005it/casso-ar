import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { CustomersPage } from './customers-page';

const apiRequest = vi.fn();
const setParam = vi.fn();
let currentSearch = '';
let currentPage = '1';

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
}));

vi.mock('@/lib/use-url-query-params', () => ({
  useUrlQueryParams: () => ({
    searchParams: new URLSearchParams({
      page: currentPage,
      ...(currentSearch ? { search: currentSearch } : {}),
    }),
    setParam,
    setPage: vi.fn(),
  }),
}));

function searchedTerms(): string[] {
  return apiRequest.mock.calls.map(
    ([config]) => (config as { params: { search: string } }).params.search,
  );
}

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

  it('queries only the settled search term instead of one request per keystroke', async () => {
    apiRequest.mockReset();
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    currentSearch = '';
    const { rerender } = render(tree());
    for (const term of ['P', 'Pe', 'Per']) {
      currentSearch = term;
      rerender(tree());
    }

    await waitFor(() => expect(searchedTerms()).toContain('Per'));
    expect(searchedTerms()).not.toContain('P');
    expect(searchedTerms()).not.toContain('Pe');
    currentSearch = '';
  });

  it('keeps the current page and pagination on screen while the next page loads', async () => {
    apiRequest.mockReset();
    apiRequest
      .mockResolvedValueOnce({
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
        total: 40,
        page: 1,
        limit: 20,
      })
      .mockReturnValueOnce(new Promise(() => {}));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const tree = () => (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <CustomersPage />
        </MemoryRouter>
      </QueryClientProvider>
    );
    const { rerender } = render(tree());
    await screen.findByText('Công ty B');
    expect(screen.getByText('Trang 1 / 2 · 40 khách hàng')).toBeInTheDocument();

    currentPage = '2';
    rerender(tree());

    await waitFor(() => expect(apiRequest).toHaveBeenCalledTimes(2));
    expect(
      screen.getByText('Công ty B').closest('[aria-busy]'),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Sau' })).toBeInTheDocument();
    currentPage = '1';
  });
});
