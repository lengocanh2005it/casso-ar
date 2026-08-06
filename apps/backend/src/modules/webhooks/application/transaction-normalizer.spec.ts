import { normalizeBalanceHookPayload } from './transaction-normalizer';

describe('normalizeBalanceHookPayload', () => {
  it('maps a Balance Hook payload into an internal transaction', () => {
    expect(
      normalizeBalanceHookPayload({
        transactionId: 'TX-001',
        amount: 30_000_000,
        transactionDateTime: '2026-08-01T10:00:00.000Z',
        counterpartyAccountNumber: '0011002233',
        counterpartyName: 'CONG TY B',
        transferContent: 'TT HD INV-2026-0012',
      }),
    ).toEqual({
      providerTransactionId: 'TX-001',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-01T10:00:00.000Z'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY B',
      transferContent: 'TT HD INV-2026-0012',
    });
  });
});
