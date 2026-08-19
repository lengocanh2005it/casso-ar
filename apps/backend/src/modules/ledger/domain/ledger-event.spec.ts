import { assertValidLedgerEventAmount } from './ledger-event';

describe('assertValidLedgerEventAmount', () => {
  it('accepts a positive integer', () => {
    expect(() => assertValidLedgerEventAmount(500_000)).not.toThrow();
  });

  it('accepts a negative integer', () => {
    expect(() => assertValidLedgerEventAmount(-500_000)).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => assertValidLedgerEventAmount(0)).toThrow(
      'Ledger event amount must not be zero',
    );
  });

  it('rejects a non-integer amount', () => {
    expect(() => assertValidLedgerEventAmount(1000.5)).toThrow(
      'Ledger event amount must be an integer',
    );
  });
});
