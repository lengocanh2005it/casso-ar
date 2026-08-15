import { ErrorCode } from '../../../common/errors/error-code';
import { Membership, Role } from '../../organizations/domain/membership';
import { BlockMemberUseCase } from './block-member.usecase';

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
  const authEmailSender = {
    sendMemberBlockedEmail: jest.fn(),
  };
  return { membershipRepo, userRepo, authEmailSender };
}

describe('BlockMemberUseCase', () => {
  beforeEach(() => {
    dataSource.transaction.mockClear();
  });

  it('blocks the target membership and sends a notification email', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership(),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      actorUserId: 'user-1',
      targetUserId: 'user-2',
    });

    expect(result.isBlocked()).toBe(true);
    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'BLOCKED' }),
      manager,
    );
    expect(authEmailSender.sendMemberBlockedEmail).toHaveBeenCalledWith(
      'member@example.com',
      'Acme',
    );
  });

  it('keeps the membership change successful when notification enqueue fails', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership(),
    );
    authEmailSender.sendMemberBlockedEmail.mockRejectedValue(
      new Error('queue unavailable'),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        actorUserId: 'user-1',
        targetUserId: 'user-2',
      }),
    ).resolves.toMatchObject({ status: 'BLOCKED' });
  });

  it('rejects blocking your own membership', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ userId: 'user-1' }),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        actorUserId: 'user-1',
        targetUserId: 'user-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(authEmailSender.sendMemberBlockedEmail).not.toHaveBeenCalled();
  });

  it('rejects blocking a membership with role OWNER', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ role: Role.OWNER }),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        actorUserId: 'user-1',
        targetUserId: 'user-2',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
    expect(membershipRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the target membership does not exist', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(null);
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        actorUserId: 'user-1',
        targetUserId: 'user-9',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });

  it('is a no-op when the membership is already BLOCKED', async () => {
    const { membershipRepo, userRepo, authEmailSender } = buildDeps(
      buildMembership({ status: 'BLOCKED', blockedAt: new Date('2026-08-05') }),
    );
    const useCase = new BlockMemberUseCase(
      membershipRepo as never,
      userRepo as never,
      authEmailSender as never,
      dataSource as never,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      actorUserId: 'user-1',
      targetUserId: 'user-2',
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(authEmailSender.sendMemberBlockedEmail).not.toHaveBeenCalled();
  });
});
