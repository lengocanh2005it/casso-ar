import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PendingReviewItem } from '../types';
import { ExceptionsBulkActionBar } from './exceptions-bulk-action-bar';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown) =>
    apiRequest({ url, method: 'POST', data }),
}));
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));

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
});
