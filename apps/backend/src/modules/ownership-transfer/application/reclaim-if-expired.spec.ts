import { OwnershipTransferRequest } from '../domain/ownership-transfer-request';
import { reclaimIfExpired } from './reclaim-if-expired';

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
    otpExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('reclaimIfExpired', () => {
  it('leaves a non-expired request untouched', async () => {
    const request = buildRequest();
    const save = jest.fn();
    const manager = {} as never;

    const result = await reclaimIfExpired(
      { save } as never,
      request,
      manager,
    );

    expect(result).toBe(request);
    expect(save).not.toHaveBeenCalled();
  });

  it('expires and saves a stale request', async () => {
    const request = buildRequest({
      otpExpiresAt: new Date('2020-01-01T00:00:00.000Z'),
    });
    const save = jest.fn();
    const manager = {} as never;

    const result = await reclaimIfExpired(
      { save } as never,
      request,
      manager,
    );

    expect(result.status).toBe('EXPIRED');
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXPIRED' }),
      manager,
    );
  });
});
