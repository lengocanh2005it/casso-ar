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

const dataSource = {
  transaction: jest.fn(
    async (callback: (value: typeof manager) => Promise<unknown>) =>
      callback(manager),
  ),
};

function buildUseCase(
  inviteRepo: Record<string, jest.Mock>,
  organizationRepo: Record<string, jest.Mock>,
  inviteMemberUseCase: Record<string, jest.Mock>,
  tenantContext = { getOrganizationId: jest.fn().mockReturnValue('org-1') },
) {
  return new ResendInviteUseCase(
    inviteRepo as never,
    organizationRepo as never,
    inviteMemberUseCase as never,
    tenantContext as never,
    dataSource as never,
  );
}

describe('ResendInviteUseCase', () => {
  it('deletes the old invite and re-invites the same email with the same role', async () => {
    const inviteRepo = {
      findByTokenHash: jest.fn(),
      findById: jest.fn().mockResolvedValue(buildInvite()),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'org-1', name: 'Công ty A' }),
    };
    const inviteMemberUseCase = {
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const useCase = buildUseCase(
      inviteRepo,
      organizationRepo,
      inviteMemberUseCase,
    );

    await useCase.execute('invite-1');

    expect(inviteRepo.findById).toHaveBeenCalledWith('invite-1', 'org-1');
    expect(inviteRepo.delete).toHaveBeenCalledWith(
      'invite-1',
      'org-1',
      manager,
    );
    expect(inviteMemberUseCase.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      organizationName: 'Công ty A',
      email: 'member@example.com',
      role: Role.ACCOUNTANT,
      invitedByUserId: 'user-1',
    });
  });

  it('rejects resending an invite that does not exist in the organization', async () => {
    const inviteRepo = {
      findByTokenHash: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const organizationRepo = { findById: jest.fn() };
    const inviteMemberUseCase = { execute: jest.fn() };
    const useCase = buildUseCase(
      inviteRepo,
      organizationRepo,
      inviteMemberUseCase,
    );

    await expect(useCase.execute('invite-9')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(inviteMemberUseCase.execute).not.toHaveBeenCalled();
  });

  it('rejects resending an already-accepted invite', async () => {
    const inviteRepo = {
      findByTokenHash: jest.fn(),
      findById: jest
        .fn()
        .mockResolvedValue(buildInvite({ acceptedAt: new Date() })),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const organizationRepo = { findById: jest.fn() };
    const inviteMemberUseCase = { execute: jest.fn() };
    const useCase = buildUseCase(
      inviteRepo,
      organizationRepo,
      inviteMemberUseCase,
    );

    await expect(useCase.execute('invite-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(inviteMemberUseCase.execute).not.toHaveBeenCalled();
  });
});
