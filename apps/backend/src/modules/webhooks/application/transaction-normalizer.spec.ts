import { normalizeBalanceHookPayload } from './transaction-normalizer';

describe('normalizeBalanceHookPayload', () => {
  it('maps the real nested Balance Hook payload into an internal transaction', () => {
    expect(
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          id: 'TX-001',
          amount: 30_000_000,
          transactionDateTime: '2026-08-01T10:00:00.000Z',
          counterAccountNumber: '0011002233',
          counterAccountName: 'CONG TY B',
          description: 'TT HD INV-2026-0012',
        },
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

  it('maps null counterparty fields to empty strings instead of throwing', () => {
    expect(
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          id: 'TX-002',
          amount: 10_000,
          transactionDateTime: '2023-12-05T16:25:00+07:00',
          counterAccountNumber: null,
          counterAccountName: null,
          description: null,
        },
      }),
    ).toEqual({
      providerTransactionId: 'TX-002',
      amount: 10_000,
      transactionDateTime: new Date('2023-12-05T16:25:00+07:00'),
      counterpartyAccountNumber: '',
      counterpartyName: '',
      transferContent: '',
    });
  });

  it('coerces a numeric counterAccountNumber to a string', () => {
    const result = normalizeBalanceHookPayload({
      grantId: 'grant-1',
      transaction: {
        id: 'TX-003',
        amount: 1_000,
        transactionDateTime: '2026-08-01T10:00:00.000Z',
        counterAccountNumber: 1234567,
        counterAccountName: 'A',
        description: 'x',
      },
    });
    expect(result.counterpartyAccountNumber).toBe('1234567');
  });

  it('throws when transaction.id is missing', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          amount: 1_000,
          transactionDateTime: '2026-08-01T10:00:00.000Z',
        },
      }),
    ).toThrow('Webhook field transaction.id is invalid');
  });

  it('throws when transaction.amount is not an integer', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        grantId: 'grant-1',
        transaction: {
          id: 'TX-004',
          amount: 10.5,
          transactionDateTime: '2026-08-01T10:00:00.000Z',
        },
      }),
    ).toThrow('Webhook field transaction.amount must be an integer');
  });
});
