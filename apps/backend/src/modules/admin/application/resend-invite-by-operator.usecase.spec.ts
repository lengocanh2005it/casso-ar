import { ErrorCode } from '../../../common/errors/error-code';
import { MembershipInvite } from '../../auth/domain/membership-invite';
import { Role } from '../../organizations/domain/membership';
import { ResendInviteByOperatorUseCase } from './resend-invite-by-operator.usecase';

function buildInvite(
  overrides: Partial<ConstructorParameters<typeof MembershipInvite>[0]> = {},
) {
  return new MembershipInvite({
    id: 'invite-1',
    organizationId: 'org-1',
    email: 'member@example.com',
    role: Role.OWNER,
    invitedByUserId: 'user-1',
    tokenHash: 'old-hash',
    expiresAt: new Date(Date.now() - 60_000),
    acceptedAt: null,
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

function buildUseCase(invite: MembershipInvite | null) {
  const manager = {};
  const inviteRepo = {
    findByIdForUpdate: jest.fn().mockResolvedValue(invite),
    delete: jest.fn(),
    save: jest.fn(),
  };
  const organizationRepo = {
    findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Acme' }),
  };
  const auditRepo = { save: jest.fn() };
  const emailSender = {
    sendInviteEmail: jest.fn().mockResolvedValue(undefined),
  };
  const dataSource = {
    transaction: jest
      .fn()
      .mockImplementation(async (callback: (value: unknown) => unknown) =>
        callback(manager),
      ),
  };
  return {
    useCase: new ResendInviteByOperatorUseCase(
      dataSource as any,
      inviteRepo as any,
      organizationRepo as any,
      emailSender as any,
      auditRepo as any,
    ),
    inviteRepo,
    organizationRepo,
    auditRepo,
    emailSender,
    manager,
  };
}

describe('ResendInviteByOperatorUseCase', () => {
  it('replaces an expired pending OWNER invite and queues the new token after commit', async () => {
    const {
      useCase,
      inviteRepo,
      organizationRepo,
      auditRepo,
      emailSender,
      manager,
    } = buildUseCase(buildInvite());

    await useCase.execute({
      organizationId: 'org-1',
      inviteId: 'invite-1',
      operatorId: 'operator-1',
    });

    expect(organizationRepo.findById).toHaveBeenCalledWith('org-1');
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
    expect(inviteRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.any(String),
        organizationId: 'org-1',
        email: 'member@example.com',
        role: Role.OWNER,
        invitedByUserId: 'user-1',
        tokenHash: expect.any(String),
        expiresAt: expect.any(Date),
        acceptedAt: null,
      }),
      manager,
    );
    expect(auditRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        operatorId: 'operator-1',
        organizationId: 'org-1',
        actionType: 'INVITE_RESENT',
        inviteId: 'invite-1',
      }),
      manager,
    );
    expect(emailSender.sendInviteEmail).toHaveBeenCalledWith(
      'member@example.com',
      expect.stringMatching(/^\/invites\/accept\?token=.+/),
      'Acme',
    );
  });

  it('rejects a missing invite', async () => {
    const { useCase, emailSender } = buildUseCase(null);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        inviteId: 'invite-9',
        operatorId: 'operator-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(emailSender.sendInviteEmail).not.toHaveBeenCalled();
  });

  it('rejects an accepted invite', async () => {
    const { useCase, emailSender } = buildUseCase(
      buildInvite({ acceptedAt: new Date() }),
    );

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        inviteId: 'invite-1',
        operatorId: 'operator-1',
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(emailSender.sendInviteEmail).not.toHaveBeenCalled();
  });

  it('maps synchronous queue enqueue failure to EMAIL_SEND_FAILED after the transaction', async () => {
    const { useCase, emailSender, inviteRepo, auditRepo } = buildUseCase(
      buildInvite(),
    );
    const original = new Error('queue unavailable');
    emailSender.sendInviteEmail.mockRejectedValue(original);

    await expect(
      useCase.execute({
        organizationId: 'org-1',
        inviteId: 'invite-1',
        operatorId: 'operator-1',
      }),
    ).rejects.toMatchObject({
      errorCode: ErrorCode.EMAIL_SEND_FAILED,
      cause: original,
    });
    expect(inviteRepo.save).toHaveBeenCalled();
    expect(auditRepo.save).toHaveBeenCalled();
  });
});
