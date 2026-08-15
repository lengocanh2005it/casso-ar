import { Membership, Role } from '../../organizations/domain/membership';
import { BlockMemberByOperatorUseCase } from './block-member-by-operator.usecase';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.OWNER,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

function buildDeps(membership: Membership | null) {
  const membershipRepo = {
    findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    save: jest.fn(),
  };
  const userRepo = {
    findById: jest
      .fn()
      .mockResolvedValue({ id: 'user-1', email: 'owner@example.com' }),
  };
  const auditRepo = { save: jest.fn() };
  const authEmailSender = { sendMemberBlockedEmail: jest.fn() };
  const dataSource = {
    transaction: jest.fn((callback: (manager: unknown) => unknown) =>
      callback({}),
    ),
  };
  return { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource };
}

describe('BlockMemberByOperatorUseCase', () => {
  it('blocks a membership with role OWNER (Operator-exclusive) and writes an audit log', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(buildMembership());
    const useCase = new BlockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      userId: 'user-1',
      operatorId: 'op-1',
    });

    expect(membershipRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'BLOCKED' }),
      expect.anything(),
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'op-1',
        organizationId: 'org-1',
        actionType: 'MEMBER_BLOCKED',
        membershipId: 'mem-1',
      }),
      expect.anything(),
    );
    expect(authEmailSender.sendMemberBlockedEmail).toHaveBeenCalledWith(
      'owner@example.com',
      'Acme',
    );
  });

  it('is a no-op when the membership is already BLOCKED', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(
        buildMembership({
          status: 'BLOCKED',
          blockedAt: new Date('2026-08-05'),
        }),
      );
    const useCase = new BlockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      organizationName: 'Acme',
      userId: 'user-1',
      operatorId: 'op-1',
    });

    expect(membershipRepo.save).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('throws NOT_FOUND when the membership does not exist', async () => {
    const { membershipRepo, userRepo, auditRepo, authEmailSender, dataSource } =
      buildDeps(null);
    const useCase = new BlockMemberByOperatorUseCase(
      dataSource as any,
      membershipRepo as any,
      userRepo as any,
      auditRepo as any,
      authEmailSender as any,
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        organizationName: 'Acme',
        userId: 'user-9',
        operatorId: 'op-1',
      }),
    ).rejects.toMatchObject({ errorCode: 'NOT_FOUND' });
  });
});
