import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PendingReviewItem } from '../types';
import { ExceptionsBulkActionBar } from './exceptions-bulk-action-bar';

const { apiRequest, toastError, toastSuccess } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));
vi.mock('sonner', () => ({
  toast: { error: toastError, success: toastSuccess },
}));

beforeEach(() => {
  apiRequest.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

function renderBar(items: PendingReviewItem[], onResult = vi.fn()) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ExceptionsBulkActionBar
        items={items}
        selectedIds={items.map((item) => item.transaction.id)}
        onResult={onResult}
      />
    </QueryClientProvider>,
  );
}

describe('ExceptionsBulkActionBar', () => {
  it('skips the selected transactions immediately with no confirmation dialog', async () => {
    apiRequest.mockResolvedValue({
      results: [{ id: 'tx-1', status: 'success' }],
    });
    renderBar([
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
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/batch-skip',
          data: { ids: ['tx-1'] },
        }),
      ),
    );
  });

  it('shows a loading label while skipping selected transactions', async () => {
    let resolveRequest: (value: unknown) => void = () => undefined;
    apiRequest.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    renderBar([
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
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));

    const pendingButton = await screen.findByRole('button', {
      name: 'Đang xử lý…',
    });
    expect(pendingButton).toBeDisabled();
    expect(pendingButton).toHaveClass('min-w-24');
    resolveRequest({ results: [{ id: 'tx-1', status: 'success' }] });
  });

  it('adds autocomplete metadata to the prepaid customer search', () => {
    apiRequest.mockResolvedValue({ results: [] });
    renderBar([
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
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận công nợ' }));

    const input = screen.getByLabelText('Tìm khách hàng');
    expect(input).toHaveAttribute('name', 'customerSearch');
    expect(input).toHaveAttribute('autocomplete', 'off');
  });

  it('only enables approve-match for rows at or above the confidence threshold, and confirms before sending', async () => {
    apiRequest.mockResolvedValue({
      results: [{ id: 'tx-high', status: 'success' }],
    });
    const highConfidence = {
      transaction: {
        id: 'tx-high',
        providerTransactionId: 'TX-HIGH',
        amount: 20_000,
        transactionDateTime: '2026-08-01',
        counterpartyAccountNumber: '001',
        counterpartyName: 'A',
        transferContent: 'note',
        status: 'PENDING_REVIEW' as const,
        version: 1,
      },
      topCandidate: {
        id: 'cand-1',
        receivableId: 'rec-1',
        customerId: 'cust-1',
        referenceCodeScore: 50,
        amountScore: 20,
        customerBankAccountScore: 10,
        payerNameScore: 0,
        timingScore: 0,
        totalScore: 80,
        invoiceNumber: 'INV-001',
        customerName: 'Công ty A',
        remainingAmount: 20_000,
        dueDate: '2026-08-31',
        createdAt: '2026-08-01',
      },
    };
    const lowConfidence = {
      transaction: {
        id: 'tx-low',
        providerTransactionId: 'TX-LOW',
        amount: 5_000,
        transactionDateTime: '2026-08-01',
        counterpartyAccountNumber: '002',
        counterpartyName: 'B',
        transferContent: 'note',
        status: 'PENDING_REVIEW' as const,
        version: 1,
      },
      topCandidate: {
        id: 'cand-2',
        receivableId: 'rec-2',
        customerId: 'cust-2',
        referenceCodeScore: 30,
        amountScore: 10,
        customerBankAccountScore: 0,
        payerNameScore: 0,
        timingScore: 0,
        totalScore: 40,
        invoiceNumber: 'INV-002',
        customerName: 'Công ty B',
        remainingAmount: 5_000,
        dueDate: '2026-08-31',
        createdAt: '2026-08-01',
      },
    };
    renderBar([highConfidence, lowConfidence]);

    const approveButton = screen.getByRole('button', {
      name: /Khớp giao dịch được gợi ý \(1\)/,
    });
    fireEvent.click(approveButton);
    fireEvent.click(
      screen.getByRole('button', { name: 'Xác nhận khớp giao dịch' }),
    );

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/batch-match',
          data: {
            items: [
              {
                bankTransactionId: 'tx-high',
                allocations: [{ receivableId: 'rec-1', amount: 20_000 }],
                version: 1,
              },
            ],
          },
        }),
      ),
    );
  });

  it('reports a transport failure when skipping selected transactions fails', async () => {
    apiRequest.mockRejectedValue(new Error('network'));
    renderBar([
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
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Bỏ qua' }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith(
        'Không thể xử lý thao tác hàng loạt. Vui lòng thử lại.',
      ),
    );
  });
});
