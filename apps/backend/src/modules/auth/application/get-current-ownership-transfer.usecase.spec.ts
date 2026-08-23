import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { GetCurrentOwnershipTransferUseCase } from './get-current-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

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
    otpExpiresAt: new Date(Date.now() + 60_000),
    acceptanceExpiresAt: null,
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('GetCurrentOwnershipTransferUseCase', () => {
  it('returns the non-terminal request for the organization', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(buildRequest()),
      save: jest.fn(),
    };
    const useCase = new GetCurrentOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    );

    const result = await useCase.execute('org-1');

    expect(result?.id).toBe('req-1');
  });

  it('returns null when there is none', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    };
    const useCase = new GetCurrentOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1')).toBeNull();
  });

  it('returns null and reclaims a stale request', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest
        .fn()
        .mockResolvedValue(buildRequest({ otpExpiresAt: new Date('2020-01-01') })),
      save: jest.fn(),
    };
    const useCase = new GetCurrentOwnershipTransferUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1')).toBeNull();
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'EXPIRED' }),
      manager,
    );
  });
});
