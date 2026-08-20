import { normalizeBalanceHookPayload } from './transaction-normalizer';

describe('normalizeBalanceHookPayload', () => {
  it('maps the real Casso Flow payload into an internal transaction', () => {
    expect(
      normalizeBalanceHookPayload({
        error: 0,
        data: {
          id: 123,
          amount: 30_000_000,
          transactionDateTime: '2026-08-01 10:00:00',
          counterAccountNumber: '0011002233',
          counterAccountName: 'CONG TY B',
          description: 'TT HD INV-2026-0012',
        },
      }),
    ).toEqual({
      providerTransactionId: '123',
      amount: 30_000_000,
      transactionDateTime: new Date('2026-08-01T10:00:00+07:00'),
      counterpartyAccountNumber: '0011002233',
      counterpartyName: 'CONG TY B',
      transferContent: 'TT HD INV-2026-0012',
    });
  });

  it('maps empty-string counterparty fields through unchanged', () => {
    const result = normalizeBalanceHookPayload({
      error: 0,
      data: {
        id: 124,
        amount: 10_000,
        transactionDateTime: '2026-08-01 10:00:00',
        counterAccountNumber: '',
        counterAccountName: '',
        description: '',
      },
    });
    expect(result.counterpartyAccountNumber).toBe('');
    expect(result.counterpartyName).toBe('');
    expect(result.transferContent).toBe('');
  });

  it('coerces a numeric counterAccountNumber to a string', () => {
    const result = normalizeBalanceHookPayload({
      error: 0,
      data: {
        id: 125,
        amount: 1_000,
        transactionDateTime: '2026-08-01 10:00:00',
        counterAccountNumber: 8888888888,
        counterAccountName: 'A',
        description: 'x',
      },
    });
    expect(result.counterpartyAccountNumber).toBe('8888888888');
  });

  it('throws when data.id is missing', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        error: 0,
        data: { amount: 1_000, transactionDateTime: '2026-08-01 10:00:00' },
      }),
    ).toThrow('Webhook field data.id is invalid');
  });

  it('throws when data.transactionDateTime cannot be parsed', () => {
    expect(() =>
      normalizeBalanceHookPayload({
        error: 0,
        data: { id: 1, amount: 1_000, transactionDateTime: 'not-a-date' },
      }),
    ).toThrow('Webhook field data.transactionDateTime is invalid');
  });
});
