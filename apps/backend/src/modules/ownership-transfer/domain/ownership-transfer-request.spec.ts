import { OwnershipTransferRequest } from './ownership-transfer-request';

function buildRequest(
  overrides: Partial<ConstructorParameters<typeof OwnershipTransferRequest>[0]> = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_OTP_CONFIRMATION',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('OwnershipTransferRequest', () => {
  it('is non-terminal while pending OTP confirmation or acceptance', () => {
    expect(buildRequest({ status: 'PENDING_OTP_CONFIRMATION' }).isNonTerminal()).toBe(true);
    expect(buildRequest({ status: 'PENDING_ACCEPTANCE' }).isNonTerminal()).toBe(true);
    expect(buildRequest({ status: 'ACCEPTED' }).isNonTerminal()).toBe(false);
    expect(buildRequest({ status: 'DECLINED' }).isNonTerminal()).toBe(false);
    expect(buildRequest({ status: 'CANCELLED' }).isNonTerminal()).toBe(false);
    expect(buildRequest({ status: 'EXPIRED' }).isNonTerminal()).toBe(false);
  });

  it('is OTP-expired only while PENDING_OTP_CONFIRMATION and past otpExpiresAt', () => {
    const request = buildRequest({
      status: 'PENDING_OTP_CONFIRMATION',
      otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    });
    expect(request.isOtpExpired(new Date('2026-08-23T00:04:59.000Z'))).toBe(false);
    expect(request.isOtpExpired(new Date('2026-08-23T00:05:01.000Z'))).toBe(true);
    expect(
      buildRequest({
        status: 'PENDING_ACCEPTANCE',
        otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
      }).isOtpExpired(new Date('2026-08-23T00:05:01.000Z')),
    ).toBe(false);
  });

  it('is acceptance-expired only while PENDING_ACCEPTANCE and past acceptanceExpiresAt', () => {
    const request = buildRequest({
      status: 'PENDING_ACCEPTANCE',
      acceptanceExpiresAt: new Date('2026-08-25T00:00:00.000Z'),
    });
    expect(request.isAcceptanceExpired(new Date('2026-08-24T23:59:59.000Z'))).toBe(false);
    expect(request.isAcceptanceExpired(new Date('2026-08-25T00:00:01.000Z'))).toBe(true);
  });

  it('confirm() moves to PENDING_ACCEPTANCE and sets the acceptance window', () => {
    const request = buildRequest({ status: 'PENDING_OTP_CONFIRMATION' });
    const acceptanceExpiresAt = new Date('2026-08-25T00:00:00.000Z');
    const confirmed = request.confirm(acceptanceExpiresAt);
    expect(confirmed.status).toBe('PENDING_ACCEPTANCE');
    expect(confirmed.acceptanceExpiresAt).toBe(acceptanceExpiresAt);
  });

  it('accept()/decline()/cancel()/expire() set status and resolvedAt', () => {
    const base = buildRequest({ status: 'PENDING_ACCEPTANCE' });
    expect(base.accept().status).toBe('ACCEPTED');
    expect(base.accept().resolvedAt).not.toBeNull();
    expect(base.decline().status).toBe('DECLINED');
    expect(base.cancel().status).toBe('CANCELLED');
    expect(base.expire().status).toBe('EXPIRED');
  });
});
