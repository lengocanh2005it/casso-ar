import { createHash } from 'node:crypto';
import { getImportRequestFingerprint } from './import-request-fingerprint';

describe('getImportRequestFingerprint', () => {
  it('hashes filename, a NUL separator, and file bytes deterministically', () => {
    const buffer = Buffer.from('invoice-bytes');
    const expected = createHash('sha256')
      .update('invoices.csv')
      .update('\0')
      .update(buffer)
      .digest('hex');

    expect(getImportRequestFingerprint(buffer, 'invoices.csv')).toBe(expected);
    expect(getImportRequestFingerprint(buffer, 'invoices.csv')).toBe(expected);
  });

  it('changes when either filename or bytes change', () => {
    const base = getImportRequestFingerprint(Buffer.from('a'), 'invoices.csv');

    expect(
      getImportRequestFingerprint(Buffer.from('b'), 'invoices.csv'),
    ).not.toBe(base);
    expect(getImportRequestFingerprint(Buffer.from('a'), 'other.csv')).not.toBe(
      base,
    );
  });
});
