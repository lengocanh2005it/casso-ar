import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { MembershipInvite } from '../domain/membership-invite';
import { ResendInviteUseCase } from './resend-invite.usecase';

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

const manager = { name: 'transaction-manager' };

function buildUseCase(
  inviteRepo: Record<string, jest.Mock>,
  organizationRepo: Record<string, jest.Mock>,
  emailSender: Record<string, jest.Mock>,
  tenantContext = { getOrganizationId: jest.fn().mockReturnValue('org-1') },
) {
  const dataSource = {
    transaction: jest.fn(
      async (callback: (value: typeof manager) => Promise<unknown>) =>
        callback(manager),
    ),
  };
  return {
    useCase: new ResendInviteUseCase(
      inviteRepo as never,
      organizationRepo as never,
      emailSender as never,
      tenantContext as never,
      dataSource as never,
    ),
    dataSource,
  };
}

describe('ResendInviteUseCase', () => {
  it('deletes the old invite and creates the new one in a single transaction, then emails after commit', async () => {
    const inviteRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(buildInvite()),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Công ty A' }),
    };
    const emailSender = { sendInviteEmail: jest.fn() };
    const { useCase, dataSource } = buildUseCase(
      inviteRepo,
      organizationRepo,
      emailSender,
    );

    await useCase.execute('invite-1');

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
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
        organizationId: 'org-1',
        email: 'member@example.com',
        role: Role.ACCOUNTANT,
        invitedByUserId: 'user-1',
      }),
      manager,
    );
    expect(emailSender.sendInviteEmail).toHaveBeenCalledWith(
      'member@example.com',
      expect.stringMatching(/\/invite-accept\?token=/),
      'Công ty A',
    );
  });

  it('rejects resending an invite that does not exist in the organization', async () => {
    const inviteRepo = {
      findByIdForUpdate: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Công ty A' }),
    };
    const emailSender = { sendInviteEmail: jest.fn() };
    const { useCase } = buildUseCase(inviteRepo, organizationRepo, emailSender);

    await expect(useCase.execute('invite-9')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(emailSender.sendInviteEmail).not.toHaveBeenCalled();
  });

  it('rejects resending an already-accepted invite', async () => {
    const inviteRepo = {
      findByIdForUpdate: jest
        .fn()
        .mockResolvedValue(buildInvite({ acceptedAt: new Date() })),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Công ty A' }),
    };
    const emailSender = { sendInviteEmail: jest.fn() };
    const { useCase } = buildUseCase(inviteRepo, organizationRepo, emailSender);

    await expect(useCase.execute('invite-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(emailSender.sendInviteEmail).not.toHaveBeenCalled();
  });

  it('rejects when the organization no longer exists', async () => {
    const inviteRepo = {
      findByIdForUpdate: jest.fn(),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const organizationRepo = { findById: jest.fn().mockResolvedValue(null) };
    const emailSender = { sendInviteEmail: jest.fn() };
    const { useCase } = buildUseCase(inviteRepo, organizationRepo, emailSender);

    await expect(useCase.execute('invite-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(inviteRepo.findByIdForUpdate).not.toHaveBeenCalled();
  });
});
