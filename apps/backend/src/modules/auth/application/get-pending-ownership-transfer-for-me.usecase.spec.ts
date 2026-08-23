import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { GetPendingOwnershipTransferForMeUseCase } from './get-pending-ownership-transfer-for-me.usecase';

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
    status: 'PENDING_ACCEPTANCE',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: new Date(Date.now() + 60_000),
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

describe('GetPendingOwnershipTransferForMeUseCase', () => {
  it('returns the request when it targets the caller', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(buildRequest()),
      save: jest.fn(),
    };
    const useCase = new GetPendingOwnershipTransferForMeUseCase(
      requestRepo as never,
      dataSource as never,
    );

    const result = await useCase.execute('org-1', 'target-1');

    expect(result?.id).toBe('req-1');
  });

  it('returns null when it targets someone else', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest.fn().mockResolvedValue(buildRequest()),
      save: jest.fn(),
    };
    const useCase = new GetPendingOwnershipTransferForMeUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1', 'someone-else')).toBeNull();
  });

  it('returns null while still PENDING_OTP_CONFIRMATION (target has nothing to act on yet)', async () => {
    const requestRepo = {
      findNonTerminalByOrganization: jest
        .fn()
        .mockResolvedValue(buildRequest({ status: 'PENDING_OTP_CONFIRMATION' })),
      save: jest.fn(),
    };
    const useCase = new GetPendingOwnershipTransferForMeUseCase(
      requestRepo as never,
      dataSource as never,
    );

    expect(await useCase.execute('org-1', 'target-1')).toBeNull();
  });
});
