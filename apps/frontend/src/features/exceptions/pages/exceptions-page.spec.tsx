import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { ExceptionsPage } from './exceptions-page';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: vi.fn(),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));

describe('ExceptionsPage', () => {
  it('sends the search box value as a search filter', async () => {
    apiRequest.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExceptionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.change(
      await screen.findByPlaceholderText(
        'Tìm theo tên, số tài khoản hoặc nội dung chuyển khoản…',
      ),
      { target: { value: 'nguyen van a' } },
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/unmatched',
          params: expect.objectContaining({ search: 'nguyen van a' }),
        }),
      ),
    );
  });

  it('renders a checkbox per row and shows the bulk action bar once a row is selected', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          transaction: {
            id: 'tx-1',
            providerTransactionId: 'TX-1',
            amount: 10_000,
            transactionDateTime: '2026-08-01',
            counterpartyAccountNumber: '001',
            counterpartyName: 'A',
            transferContent: 'note',
            status: 'PENDING_REVIEW',
            version: 1,
          },
          topCandidate: null,
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
          <ExceptionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const rowCheckbox = (await screen.findAllByRole('checkbox'))[1];
    fireEvent.click(rowCheckbox);

    expect(await screen.findByText('Đã chọn 1')).toBeInTheDocument();
  });

  it('shows the transfer content column with a fallback when it is blank', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          transaction: {
            id: 'tx-1',
            providerTransactionId: 'TX-1',
            amount: 10_000,
            transactionDateTime: '2026-08-01',
            counterpartyAccountNumber: '001',
            counterpartyName: 'A',
            transferContent: 'Thanh toan hoa don INV-001',
            status: 'PENDING_REVIEW',
            version: 1,
          },
          topCandidate: null,
        },
        {
          transaction: {
            id: 'tx-2',
            providerTransactionId: 'TX-2',
            amount: 20_000,
            transactionDateTime: '2026-08-02',
            counterpartyAccountNumber: '002',
            counterpartyName: 'B',
            transferContent: '   ',
            status: 'PENDING_REVIEW',
            version: 1,
          },
          topCandidate: null,
        },
      ],
      total: 2,
      page: 1,
      limit: 20,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExceptionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole('columnheader', {
        name: 'Nội dung chuyển khoản',
      }),
    ).toBeInTheDocument();
    expect(screen.getByText('Thanh toan hoa don INV-001')).toBeInTheDocument();
    expect(screen.getByText('Không có nội dung')).toBeInTheDocument();
  });

  it('does not open the split dialog when a row checkbox receives keyboard input', async () => {
    apiRequest.mockResolvedValue({
      items: [
        {
          transaction: {
            id: 'tx-1',
            providerTransactionId: 'TX-1',
            amount: 10_000,
            transactionDateTime: '2026-08-01',
            counterpartyAccountNumber: '001',
            counterpartyName: 'A',
            transferContent: 'note',
            status: 'PENDING_REVIEW',
            version: 1,
          },
          topCandidate: null,
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
          <ExceptionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const rowCheckbox = (await screen.findAllByRole('checkbox'))[1];
    fireEvent.keyDown(rowCheckbox, { key: ' ' });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('explains how to recover when loading the review queue fails', async () => {
    apiRequest.mockRejectedValue(new Error('network'));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <ExceptionsPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(
      await screen.findByText(
        'Không thể tải danh sách giao dịch cần xử lý. Vui lòng thử lại.',
      ),
    ).toBeInTheDocument();
  });
});
