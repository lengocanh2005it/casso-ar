import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { MembershipInvite } from '../domain/membership-invite';
import { DeleteInviteUseCase } from './delete-invite.usecase';

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

describe('DeleteInviteUseCase', () => {
  it('deletes an invite that belongs to the caller organization', async () => {
    const repo = {
      findByTokenHash: jest.fn(),
      findById: jest.fn().mockResolvedValue(buildInvite()),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new DeleteInviteUseCase(
      repo as never,
      tenantContext as never,
    );

    await useCase.execute('invite-1');

    expect(repo.findById).toHaveBeenCalledWith('invite-1', 'org-1');
    expect(repo.delete).toHaveBeenCalledWith('invite-1', 'org-1');
  });

  it('rejects deleting an invite that does not exist in the organization', async () => {
    const repo = {
      findByTokenHash: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new DeleteInviteUseCase(
      repo as never,
      tenantContext as never,
    );

    await expect(useCase.execute('invite-9')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('rejects deleting an already-accepted invite', async () => {
    const repo = {
      findByTokenHash: jest.fn(),
      findById: jest
        .fn()
        .mockResolvedValue(buildInvite({ acceptedAt: new Date() })),
      delete: jest.fn(),
      save: jest.fn(),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new DeleteInviteUseCase(
      repo as never,
      tenantContext as never,
    );

    await expect(useCase.execute('invite-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(repo.delete).not.toHaveBeenCalled();
  });
});
