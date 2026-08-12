import { ErrorCode } from '../../../common/errors/error-code';
import { Membership, Role } from '../domain/membership';
import { ChangeMemberRoleUseCase } from './change-member-role.usecase';

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

function buildUseCase(
  repo: Record<string, jest.Mock>,
  tenantContext = { getOrganizationId: jest.fn().mockReturnValue('org-1') },
) {
  return new ChangeMemberRoleUseCase(
    repo as never,
    tenantContext as never,
    dataSource as never,
  );
}

describe('ChangeMemberRoleUseCase', () => {
  it('changes the role of an active member in the caller organization', async () => {
    const membership = buildMembership();
    const repo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
      countActiveByRole: jest.fn().mockResolvedValue(2),
      save: jest.fn(),
    };
    const useCase = buildUseCase(repo);

    const result = await useCase.execute({
      userId: 'user-1',
      role: Role.VIEWER,
    });

    expect(result.role).toBe(Role.VIEWER);
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'mem-1', role: Role.VIEWER }),
      manager,
    );
  });

  it('rejects changing a member that does not belong to the organization', async () => {
    const repo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(null),
      countActiveByRole: jest.fn(),
      save: jest.fn(),
    };
    const useCase = buildUseCase(repo);

    await expect(
      useCase.execute({ userId: 'user-9', role: Role.VIEWER }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('rejects demoting the last active OWNER', async () => {
    const membership = buildMembership({ role: Role.OWNER });
    const repo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
      countActiveByRole: jest.fn().mockResolvedValue(1),
      save: jest.fn(),
    };
    const useCase = buildUseCase(repo);

    await expect(
      useCase.execute({ userId: 'user-1', role: Role.VIEWER }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.countActiveByRole).toHaveBeenCalledWith(
      'org-1',
      Role.OWNER,
      manager,
    );
  });

  it('allows demoting an OWNER when another active OWNER exists', async () => {
    const membership = buildMembership({ role: Role.OWNER });
    const repo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
      countActiveByRole: jest.fn().mockResolvedValue(2),
      save: jest.fn(),
    };
    const useCase = buildUseCase(repo);

    await expect(
      useCase.execute({ userId: 'user-1', role: Role.VIEWER }),
    ).resolves.toMatchObject({ role: Role.VIEWER });
  });

  it('rejects changing the role of a member who has not joined yet', async () => {
    const membership = buildMembership({ joinedAt: null });
    const repo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
      countActiveByRole: jest.fn().mockResolvedValue(2),
      save: jest.fn(),
    };
    const useCase = buildUseCase(repo);

    await expect(
      useCase.execute({ userId: 'user-1', role: Role.VIEWER }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.CONFLICT });
    expect(repo.save).not.toHaveBeenCalled();
  });
});
