import { ErrorCode } from '../../../common/errors/error-code';
import { Membership, Role } from '../../organizations/domain/membership';
import { UnblockMemberUseCase } from './unblock-member.usecase';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-2',
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    status: 'BLOCKED',
    blockedAt: new Date('2026-08-05'),
    ...overrides,
  });
}

const manager = { name: 'transaction-manager' };
const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildDeps(membership: Membership | null) {
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    save: jest.fn(),
  };
  const userRepo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'user-2', email: 'member@example.com' }),
  };
  const authEmailSender = { sendMemberUnblockedEmail: jest.fn() };
  return { membershipRepo, userRepo, authEmailSender };
}

describe('UnblockMemberUseCase', () => {
  it('unblocks the target membership and sends a notification email', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership(),
    );
    const useCase = new UnblockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      targetUserId: 'user-2',
    });

    expect(result.isBlocked()).toBe(false);
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'ACTIVE' }),
      manager,
    );
    expect(authEmailSender.sendMemberUnblockedEmail).toHaveBeenCalledWith(
      'member@example.com',
      'Acme',
    );
  });

  it('is a no-op when the membership is already ACTIVE', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ status: 'ACTIVE', blockedAt: null }),
    );
    const useCase = new UnblockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      targetUserId: 'user-2',
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(authEmailSender.sendMemberUnblockedEmail).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the target membership does not exist', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(null);
    const useCase = new UnblockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        targetUserId: 'user-9',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
