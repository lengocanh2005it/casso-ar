import { ErrorCode } from '../../../common/errors/error-code';
import { Membership, Role } from '../../organizations/domain/membership';
import { RemoveMemberUseCase } from './remove-member.usecase';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
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

describe('RemoveMemberUseCase', () => {
  it('removes the membership and revokes the user refresh tokens in one transaction', async () => {
    const membership = buildMembership();
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
      countActiveByRole: jest.fn().mockResolvedValue(1),
      deleteByUserAndOrganization: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new RemoveMemberUseCase(
      membershipRepo as never,
      refreshTokenRepo as never,
      dataSource as never,
      tenantContext as never,
    );

    await useCase.execute({ userId: 'user-1' });

    expect(membershipRepo.deleteByUserAndOrganization).toHaveBeenCalledWith(
      'user-1',
      'org-1',
      manager,
    );
    expect(refreshTokenRepo.revokeAllForUser).toHaveBeenCalledWith(
      'user-1',
      manager,
    );
  });

  it('rejects removing a member that does not belong to the organization', async () => {
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(null),
      countActiveByRole: jest.fn(),
      deleteByUserAndOrganization: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new RemoveMemberUseCase(
      membershipRepo as never,
      refreshTokenRepo as never,
      dataSource as never,
      tenantContext as never,
    );

    await expect(useCase.execute({ userId: 'user-9' })).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(membershipRepo.deleteByUserAndOrganization).not.toHaveBeenCalled();
    expect(refreshTokenRepo.revokeAllForUser).not.toHaveBeenCalled();
  });

  it('rejects removing the last active OWNER', async () => {
    const membership = buildMembership({ role: Role.OWNER });
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
      countActiveByRole: jest.fn().mockResolvedValue(1),
      deleteByUserAndOrganization: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new RemoveMemberUseCase(
      membershipRepo as never,
      refreshTokenRepo as never,
      dataSource as never,
      tenantContext as never,
    );

    await expect(useCase.execute({ userId: 'user-1' })).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(membershipRepo.deleteByUserAndOrganization).not.toHaveBeenCalled();
  });

  it('allows removing an OWNER when another active OWNER exists', async () => {
    const membership = buildMembership({ role: Role.OWNER });
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
      countActiveByRole: jest.fn().mockResolvedValue(2),
      deleteByUserAndOrganization: jest.fn(),
    };
    const refreshTokenRepo = { revokeAllForUser: jest.fn() };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new RemoveMemberUseCase(
      membershipRepo as never,
      refreshTokenRepo as never,
      dataSource as never,
      tenantContext as never,
    );

    await useCase.execute({ userId: 'user-1' });

    expect(membershipRepo.deleteByUserAndOrganization).toHaveBeenCalled();
  });
});
