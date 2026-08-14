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
});
