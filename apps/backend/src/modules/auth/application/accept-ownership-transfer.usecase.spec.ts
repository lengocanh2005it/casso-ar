import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { OwnershipTransferRequest } from '../../ownership-transfer/domain/ownership-transfer-request';
import { AcceptOwnershipTransferUseCase } from './accept-ownership-transfer.usecase';

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildRequest(
  overrides: Partial<
    ConstructorParameters<typeof OwnershipTransferRequest>[0]
  > = {},
) {
  return new OwnershipTransferRequest({
    id: 'req-1',
    organizationId: 'org-1',
    fromUserId: 'owner-1',
    toUserId: 'target-1',
    status: 'PENDING_ACCEPTANCE',
    otpHash: 'hash-1',
    otpExpiresAt: new Date('2026-08-23T00:05:00.000Z'),
    acceptanceExpiresAt: new Date('2100-01-01T00:00:00.000Z'),
    resolvedAt: null,
    createdAt: new Date('2026-08-23T00:00:00.000Z'),
    ...overrides,
  });
}

function buildMembership(
  role: Role,
  joinedAt: Date | null = new Date('2026-08-01'),
) {
  return {
    role,
    joinedAt,
    isActive: () => joinedAt !== null,
    isBlocked: () => false,
    withRole: jest.fn().mockImplementation((newRole: Role) => ({
      role: newRole,
      joinedAt,
      isActive: () => joinedAt !== null,
      isBlocked: () => false,
    })),
  };
}

function buildUseCase(
  overrides: {
    requestRepo?: Record<string, jest.Mock>;
    membershipRepo?: Record<string, jest.Mock>;
  } = {},
) {
  const requestRepo = {
    findById: jest.fn().mockResolvedValue(buildRequest()),
    save: jest.fn(),
    ...overrides.requestRepo,
  };
  const targetMembership = buildMembership(Role.ACCOUNTANT);
  const ownerMembership = buildMembership(Role.OWNER);
  const membershipRepo = {
    findByUserAndOrganization: jest
      .fn()
      .mockImplementation((userId: string) =>
        userId === 'target-1' ? targetMembership : ownerMembership,
      ),
    save: jest.fn(),
    ...overrides.membershipRepo,
  };
  return {
    useCase: new AcceptOwnershipTransferUseCase(
      requestRepo as never,
      membershipRepo as never,
      dataSource as never,
    ),
    requestRepo,
    membershipRepo,
    targetMembership,
    ownerMembership,
  };
}

describe('AcceptOwnershipTransferUseCase', () => {
  it('promotes the target to OWNER and demotes the requester to FINANCE_MANAGER', async () => {
    const { useCase, requestRepo, membershipRepo } = buildUseCase();

    const result = await useCase.execute({
      organizationId: 'org-1',
      requestId: 'req-1',
      actingUserId: 'target-1',
    });

    expect(result.status).toBe('ACCEPTED');
    expect(requestRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACCEPTED' }),
      manager,
    );
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.FINANCE_MANAGER }),
      manager,
    );
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ role: Role.OWNER }),
      manager,
    );
  });

  it('rejects an actor who is not the request target', async () => {
    const { useCase } = buildUseCase();

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'someone-else',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
  });

  it('rejects when the target membership is no longer active', async () => {
    const { useCase } = buildUseCase({
      membershipRepo: {
        findByUserAndOrganization: jest
          .fn()
          .mockResolvedValue(buildMembership(Role.ACCOUNTANT, null)),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'target-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });

  it('rejects accepting a request that is not PENDING_ACCEPTANCE', async () => {
    const { useCase } = buildUseCase({
      requestRepo: {
        findById: jest
          .fn()
          .mockResolvedValue(buildRequest({ status: 'CANCELLED' })),
        save: jest.fn(),
      },
    });

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        requestId: 'req-1',
        actingUserId: 'target-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
  });
});
