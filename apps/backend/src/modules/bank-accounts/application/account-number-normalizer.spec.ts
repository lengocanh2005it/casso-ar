import {
  maskAccountNumber,
  normalizeAccountNumber,
} from './account-number-normalizer';

describe('account number normalizer', () => {
  it('removes visual separators without losing leading zeroes', () => {
    expect(normalizeAccountNumber(' 0011 0022-33 ')).toBe('0011002233');
  });

  it('rejects non-string, empty, short, long, and non-digit values', () => {
    for (const value of [
      null,
      11002233,
      '',
      '123',
      '1'.repeat(35),
      '0011ABC233',
    ]) {
      expect(() => normalizeAccountNumber(value)).toThrow();
    }
  });

  it('masks all but the last four digits', () => {
    expect(maskAccountNumber('0011002233')).toBe('******2233');
    expect(maskAccountNumber('1234')).toBe('****');
  });
});
