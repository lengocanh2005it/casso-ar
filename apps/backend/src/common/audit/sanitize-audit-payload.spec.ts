import { sanitizeAuditPayload } from './sanitize-audit-payload';

describe('sanitizeAuditPayload', () => {
  it('redacts sensitive keys recursively', () => {
    expect(
      sanitizeAuditPayload({
        id: 'conn-1',
        accessToken: 'secret',
        nested: { secretKey: 'also-secret', ok: 'fine' },
      }),
    ).toEqual({
      id: 'conn-1',
      accessToken: '[REDACTED]',
      nested: { secretKey: '[REDACTED]', ok: 'fine' },
    });
  });

  it('returns null for null, undefined, and primitive values', () => {
    expect(sanitizeAuditPayload(null)).toBeNull();
    expect(sanitizeAuditPayload(undefined)).toBeNull();
    expect(sanitizeAuditPayload('secret')).toBeNull();
  });

  it('keeps ordinary objects unchanged', () => {
    expect(sanitizeAuditPayload({ id: 'rec-1', status: 'PAID' })).toEqual({
      id: 'rec-1',
      status: 'PAID',
    });
  });

  it('preserves Date values at the top level and nested', () => {
    const createdAt = new Date('2026-08-26T00:00:00.000Z');
    const dueDate = new Date('2026-09-01T00:00:00.000Z');

    expect(
      sanitizeAuditPayload({
        id: 'rec-1',
        createdAt,
        nested: { dueDate },
      }),
    ).toEqual({
      id: 'rec-1',
      createdAt,
      nested: { dueDate },
    });
  });
});
