import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SplitMatchDialog } from './split-match-dialog';

const apiRequest = vi.fn();

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (url: string, data?: unknown, headers?: unknown) =>
    apiRequest({
      url,
      method: 'POST',
      data,
      headers: { 'Idempotency-Key': 'test-key', ...(headers as object) },
    }),
}));

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { role: 'ACCOUNTANT' } }),
}));

const tx = {
  id: 'bt9',
  bankConnectionId: 'bc1',
  providerTransactionId: 'p9',
  amount: 50_000_000,
  transactionDateTime: '2026-08-02T10:00:00Z',
  counterpartyAccountNumber: '999',
  counterpartyName: 'Company C',
  transferContent: 'Payment for INV-001',
  status: 'PENDING_REVIEW' as const,
  version: 1,
};

const candidates = [
  {
    id: 'mc1',
    bankTransactionId: 'bt9',
    receivableId: 'r1',
    customerId: 'c1',
    referenceCodeScore: 60,
    amountScore: 10,
    customerBankAccountScore: 10,
    payerNameScore: 0,
    timingScore: 0,
    totalScore: 80,
  },
  {
    id: 'mc2',
    bankTransactionId: 'bt9',
    receivableId: 'r2',
    customerId: 'c1',
    referenceCodeScore: 30,
    amountScore: 10,
    customerBankAccountScore: 10,
    payerNameScore: 0,
    timingScore: 0,
    totalScore: 50,
  },
];

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SplitMatchDialog tx={tx} open onOpenChange={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('SplitMatchDialog', () => {
  beforeEach(() => {
    apiRequest.mockClear();
  });

  it('keeps allocation total within the transaction amount and submits both rows', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    const inputs = screen.getAllByLabelText(/số tiền phân bổ/i);
    fireEvent.change(inputs[0], { target: { value: '30000000' } });
    fireEvent.change(inputs[1], { target: { value: '20000000' } });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    await waitFor(() =>
      expect(apiRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          url: '/api/v1/bank-transactions/bt9/match',
          method: 'POST',
          data: expect.objectContaining({
            allocations: expect.arrayContaining([
              expect.objectContaining({
                receivableId: 'r1',
                amount: 30_000_000,
              }),
              expect.objectContaining({
                receivableId: 'r2',
                amount: 20_000_000,
              }),
            ]),
          }),
        }),
      ),
    );
  });

  it('blocks submit when allocation total exceeds the amount', async () => {
    apiRequest.mockResolvedValue(candidates);
    renderDialog();

    await waitFor(() => expect(screen.getByText('80/100')).toBeInTheDocument());
    const inputs = screen.getAllByLabelText(/số tiền phân bổ/i);
    fireEvent.change(inputs[0], { target: { value: '60000000' } });
    fireEvent.click(screen.getByRole('button', { name: /khớp giao dịch/i }));

    expect(apiRequest).not.toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/v1/bank-transactions/bt9/match',
        method: 'POST',
      }),
    );
  });
});
