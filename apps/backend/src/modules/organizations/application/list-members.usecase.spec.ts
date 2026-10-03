import { Membership, Role } from '../domain/membership';
import { ListMembersUseCase } from './list-members.usecase';

function buildMembership(overrides: Partial<Membership> = {}): Membership {
  return new Membership({
    id: 'membership-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.OWNER,
    invitedAt: new Date('2026-07-01'),
    joinedAt: new Date('2026-07-02'),
    createdAt: new Date('2026-07-01'),
    ...overrides,
  });
}

describe('ListMembersUseCase', () => {
  function buildDeps() {
    const membershipRepo = {
      findPageByOrganization: jest.fn().mockResolvedValue([buildMembership()]),
      countByOrganization: jest.fn().mockResolvedValue(1),
    };
    const userRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(
          new Map([['user-1', { email: 'owner@casso.vn', name: 'Owner' }]]),
        ),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    return { membershipRepo, userRepo, tenantContext };
  }

  it('joins membership rows with user email/name via a batched lookup', async () => {
    const { membershipRepo, userRepo, tenantContext } = buildDeps();
    const useCase = new ListMembersUseCase(
      membershipRepo as any,
      userRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
    });

    expect(userRepo.findByIds).toHaveBeenCalledWith(['user-1']);
    expect(result.items[0]).toEqual({
      membership: buildMembership(),
      user: { email: 'owner@casso.vn', name: 'Owner' },
    });
  });

  it('applies the requested status to both page rows and the total count', async () => {
    const { membershipRepo, userRepo, tenantContext } = buildDeps();
    const useCase = new ListMembersUseCase(
      membershipRepo as any,
      userRepo as any,
      tenantContext as any,
    );

    await useCase.execute({
      organizationId: 'org-1',
      page: 2,
      limit: 20,
      status: 'BLOCKED',
    });

    expect(membershipRepo.findPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      2,
      20,
      { status: 'BLOCKED' },
    );
    expect(membershipRepo.countByOrganization).toHaveBeenCalledWith('org-1', {
      status: 'BLOCKED',
    });
  });

  it('excludes orphaned memberships (user deleted) from the results', async () => {
    const { membershipRepo, userRepo, tenantContext } = buildDeps();
    membershipRepo.findPageByOrganization.mockResolvedValue([
      buildMembership(),
      buildMembership({ id: 'membership-2', userId: 'user-orphaned' }),
    ]);
    const useCase = new ListMembersUseCase(
      membershipRepo as any,
      userRepo as any,
      tenantContext as any,
    );

    const result = await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].membership.id).toBe('membership-1');
  });

  it('throws FORBIDDEN when the requested organization does not match the tenant context', async () => {
    const { membershipRepo, userRepo, tenantContext } = buildDeps();
    const useCase = new ListMembersUseCase(
      membershipRepo as any,
      userRepo as any,
      tenantContext as any,
    );

    await expect(
      useCase.execute({ organizationId: 'org-2', page: 1, limit: 20 }),
    ).rejects.toMatchObject({ errorCode: 'FORBIDDEN' });
  });
});
