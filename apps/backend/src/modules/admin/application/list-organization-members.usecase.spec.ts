import { Membership, Role } from '../../organizations/domain/membership';
import { ListOrganizationMembersUseCase } from './list-organization-members.usecase';

function buildMembership(overrides: Partial<Membership> = {}): Membership {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-02'),
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

function buildInvite(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    email: 'moi@congtyb.vn',
    role: Role.VIEWER,
    createdAt: new Date('2026-08-01'),
    expiresAt: new Date('2026-08-08'),
    ...overrides,
  };
}

function buildDeps() {
  const membershipRepo = {
    findUserIdsByOrganizationSearch: jest.fn(),
    findPageByOrganization: jest.fn().mockResolvedValue([buildMembership()]),
    countByOrganization: jest.fn().mockResolvedValue(1),
  };
  const inviteRepo = {
    findPendingPageByOrganization: jest.fn().mockResolvedValue([buildInvite()]),
    countPendingByOrganization: jest.fn().mockResolvedValue(1),
  };
  const userRepo = {
    findByIds: jest
      .fn()
      .mockResolvedValue(
        new Map([['user-1', { name: 'Nguyen Van A', email: 'a@casso.vn' }]]),
      ),
  };
  const useCase = new ListOrganizationMembersUseCase(
    membershipRepo as never,
    inviteRepo as never,
    userRepo as never,
  );
  return { membershipRepo, inviteRepo, userRepo, useCase };
}

describe('ListOrganizationMembersUseCase', () => {
  it('reads members and pending invites for ALL and batches user lookup', async () => {
    const { membershipRepo, inviteRepo, userRepo, useCase } = buildDeps();

    const result = await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      status: 'ALL',
    });

    expect(membershipRepo.findPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      undefined,
    );
    expect(membershipRepo.countByOrganization).toHaveBeenCalledWith(
      'org-1',
      undefined,
    );
    expect(inviteRepo.findPendingPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      undefined,
    );
    expect(inviteRepo.countPendingByOrganization).toHaveBeenCalledWith(
      'org-1',
      undefined,
    );
    expect(userRepo.findByIds).toHaveBeenCalledWith(['user-1']);
    expect(result.members).toEqual({
      items: [
        {
          id: 'mem-1',
          userId: 'user-1',
          name: 'Nguyen Van A',
          email: 'a@casso.vn',
          role: Role.ACCOUNTANT,
          joinedAt: new Date('2026-08-02'),
          status: 'ACTIVE',
          blockedAt: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    expect(result.pendingInvites).toEqual({
      items: [
        {
          id: 'inv-1',
          email: 'moi@congtyb.vn',
          role: Role.VIEWER,
          invitedAt: new Date('2026-08-01'),
          expiresAt: new Date('2026-08-08'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it.each(['ACTIVE', 'BLOCKED'] as const)(
    'reads members only and passes the %s status filter',
    async (status) => {
      const { membershipRepo, inviteRepo, userRepo, useCase } = buildDeps();

      const result = await useCase.execute({
        organizationId: 'org-1',
        page: 1,
        limit: 20,
        status,
      });

      expect(membershipRepo.findPageByOrganization).toHaveBeenCalledWith(
        'org-1',
        1,
        20,
        { status },
      );
      expect(membershipRepo.countByOrganization).toHaveBeenCalledWith('org-1', {
        status,
      });
      expect(inviteRepo.findPendingPageByOrganization).not.toHaveBeenCalled();
      expect(inviteRepo.countPendingByOrganization).not.toHaveBeenCalled();
      expect(userRepo.findByIds).toHaveBeenCalledWith(['user-1']);
      expect(result.pendingInvites.items).toEqual([]);
      expect(result.pendingInvites.total).toBe(0);
    },
  );

  it('returns an expired pending invite for the PENDING filter without member queries', async () => {
    const { membershipRepo, inviteRepo, userRepo, useCase } = buildDeps();
    inviteRepo.findPendingPageByOrganization.mockResolvedValue([
      buildInvite({
        id: 'inv-2',
        email: 'het-han@congtyb.vn',
        expiresAt: new Date('2026-07-01'),
      }),
    ]);
    inviteRepo.countPendingByOrganization.mockResolvedValue(1);

    const result = await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      status: 'PENDING',
    });

    expect(membershipRepo.findPageByOrganization).not.toHaveBeenCalled();
    expect(membershipRepo.countByOrganization).not.toHaveBeenCalled();
    expect(userRepo.findByIds).not.toHaveBeenCalled();
    expect(result.members.items).toEqual([]);
    expect(result.members.total).toBe(0);
    expect(result.pendingInvites.items).toEqual([
      {
        id: 'inv-2',
        email: 'het-han@congtyb.vn',
        role: Role.VIEWER,
        invitedAt: new Date('2026-08-01'),
        expiresAt: new Date('2026-07-01'),
      },
    ]);
  });

  it('trims search, scopes matching user IDs, and searches invites by email', async () => {
    const { membershipRepo, inviteRepo, useCase } = buildDeps();
    membershipRepo.findUserIdsByOrganizationSearch.mockResolvedValue([
      'user-1',
    ]);

    await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      status: 'ALL',
      search: '  acme  ',
    });

    expect(membershipRepo.findUserIdsByOrganizationSearch).toHaveBeenCalledWith(
      'org-1',
      'acme',
    );
    expect(membershipRepo.findPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      { userIds: ['user-1'] },
    );
    expect(membershipRepo.countByOrganization).toHaveBeenCalledWith('org-1', {
      userIds: ['user-1'],
    });
    expect(inviteRepo.findPendingPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      'acme',
    );
    expect(inviteRepo.countPendingByOrganization).toHaveBeenCalledWith(
      'org-1',
      'acme',
    );
  });

  it('combines the status filter with a scoped search', async () => {
    const { membershipRepo, useCase } = buildDeps();
    membershipRepo.findUserIdsByOrganizationSearch.mockResolvedValue([
      'user-1',
    ]);

    await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      status: 'BLOCKED',
      search: 'acme',
    });

    expect(membershipRepo.findPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      { status: 'BLOCKED', userIds: ['user-1'] },
    );
    expect(membershipRepo.countByOrganization).toHaveBeenCalledWith('org-1', {
      status: 'BLOCKED',
      userIds: ['user-1'],
    });
  });

  it('skips member page and count queries when the search matches no user', async () => {
    const { membershipRepo, inviteRepo, userRepo, useCase } = buildDeps();
    membershipRepo.findUserIdsByOrganizationSearch.mockResolvedValue([]);

    const result = await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      status: 'ALL',
      search: 'khong-co-ai',
    });

    expect(membershipRepo.findPageByOrganization).not.toHaveBeenCalled();
    expect(membershipRepo.countByOrganization).not.toHaveBeenCalled();
    expect(userRepo.findByIds).not.toHaveBeenCalled();
    expect(result.members).toEqual({ items: [], total: 0, page: 1, limit: 20 });
    expect(inviteRepo.findPendingPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      'khong-co-ai',
    );
  });

  it('treats whitespace-only search as no search', async () => {
    const { membershipRepo, inviteRepo, useCase } = buildDeps();

    await useCase.execute({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      status: 'ALL',
      search: '   ',
    });

    expect(
      membershipRepo.findUserIdsByOrganizationSearch,
    ).not.toHaveBeenCalled();
    expect(membershipRepo.findPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      undefined,
    );
    expect(inviteRepo.findPendingPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
      undefined,
    );
  });
});
