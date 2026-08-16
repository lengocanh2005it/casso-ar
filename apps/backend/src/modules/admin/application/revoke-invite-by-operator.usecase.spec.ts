import { ErrorCode } from '../../../common/errors/error-code';
import { MembershipInvite } from '../../auth/domain/membership-invite';
import { Role } from '../../organizations/domain/membership';
import { RevokeInviteByOperatorUseCase } from './revoke-invite-by-operator.usecase';

function buildInvite(
  overrides: Partial<ConstructorParameters<typeof MembershipInvite>[0]> = {},
) {
  return new MembershipInvite({
    id: 'invite-1',
    organizationId: 'org-1',
    email: 'member@example.com',
    role: Role.ACCOUNTANT,
    invitedByUserId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date(Date.now() + 60_000),
    acceptedAt: null,
    createdAt: new Date(),
    ...overrides,
  });
}

function buildUseCase(invite: MembershipInvite | null) {
  const manager = {};
  const inviteRepo = {
    findByIdForUpdate: jest.fn().mockResolvedValue(invite),
    delete: jest.fn(),
  };
  const auditRepo = { save: jest.fn() };
  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation(async (callback: (value: unknown) => unknown) =>
        callback(manager),
      ),
  };
  return {
    useCase: new RevokeInviteByOperatorUseCase(
      dataSource as any,
      inviteRepo as any,
      auditRepo as any,
    ),
    inviteRepo,
    auditRepo,
    dataSource,
    manager,
  };
}

describe('RevokeInviteByOperatorUseCase', () => {
  it('deletes a pending invite and writes INVITE_REVOKED in one transaction', async () => {
    const { useCase, inviteRepo, auditRepo, manager } = buildUseCase(
      buildInvite(),
    );

    await useCase.execute({
      organizationId: 'org-1',
      inviteId: 'invite-1',
      operatorId: 'operator-1',
    });

    expect(inviteRepo.findByIdForUpdate).toHaveBeenCalledWith(
      'invite-1',
      'org-1',
      manager,
    );
    expect(inviteRepo.delete).toHaveBeenCalledWith(
      'invite-1',
      'org-1',
      manager,
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'operator-1',
        organizationId: 'org-1',
        actionType: 'INVITE_REVOKED',
        inviteId: 'invite-1',
      }),
      manager,
    );
  });

  it('throws NOT_FOUND when the invite is missing in the organization', async () => {
    const { useCase, inviteRepo, auditRepo } = buildUseCase(null);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        inviteId: 'invite-9',
        operatorId: 'operator-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(inviteRepo.delete).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });

  it('throws CONFLICT for an accepted invite', async () => {
    const { useCase, inviteRepo, auditRepo } = buildUseCase(
      buildInvite({ acceptedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        inviteId: 'invite-1',
        operatorId: 'operator-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(inviteRepo.delete).not.toHaveBeenCalled();
    expect(auditRepo.save).not.toHaveBeenCalled();
  });
});
