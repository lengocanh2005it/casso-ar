import { PendingSignup } from './pending-signup';

function buildPendingSignup(
  overrides: Partial<ConstructorParameters<typeof PendingSignup>[0]> = {},
) {
  return new PendingSignup({
    id: 'pending-1',
    email: 'an@acme.vn',
    passwordHash: 'hashed',
    name: 'An',
    organizationName: 'Acme Co',
    taxCode: '0101234567',
    taxCodeMatched: true,
    taxCodeLookupName: 'Acme Co',
    otpHash: 'otp-hash',
    expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    createdAt: new Date('2026-08-24T00:00:00.000Z'),
    ...overrides,
  });
}

describe('PendingSignup', () => {
  it('is not expired before its expiresAt instant', () => {
    const pendingSignup = buildPendingSignup({
      expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    });
    expect(pendingSignup.isExpired(new Date('2026-08-24T00:09:59.000Z'))).toBe(
      false,
    );
  });

  it('is expired at or after its expiresAt instant', () => {
    const pendingSignup = buildPendingSignup({
      expiresAt: new Date('2026-08-24T00:10:00.000Z'),
    });
    expect(pendingSignup.isExpired(new Date('2026-08-24T00:10:00.000Z'))).toBe(
      true,
    );
  });
});
