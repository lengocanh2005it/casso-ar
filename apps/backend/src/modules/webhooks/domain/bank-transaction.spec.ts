import { BankTransaction } from './bank-transaction';

const props = {
  id: 'bt-1',
  organizationId: 'org-1',
  bankConnectionId: 'conn-1',
  webhookInboxId: 'wh-1',
  providerTransactionId: 'TX-001',
  amount: 30_000_000,
  transactionDateTime: new Date('2026-08-01'),
  counterpartyAccountNumber: '0011002233',
  counterpartyName: 'CONG TY B',
  transferContent: 'payment',
  status: 'UNMATCHED' as const,
  version: 1,
  createdAt: new Date('2026-08-01'),
};

describe('BankTransaction', () => {
  it('supports matching states and identifies refunds', () => {
    const transaction = new BankTransaction(props);
    expect(transaction.markMatched().status).toBe('MATCHED');
    expect(transaction.markPendingReview().status).toBe('PENDING_REVIEW');
    expect(transaction.markIgnored().status).toBe('IGNORED');
    expect(transaction.markPrepaid().status).toBe('PREPAID');
    expect(transaction.isRefund()).toBe(false);
    expect(new BankTransaction({ ...props, amount: -1 }).isRefund()).toBe(true);
  });
});
