import { IsNull, Not } from 'typeorm';
import { Membership, Role } from '../domain/membership';
import { MembershipOrmEntity } from './membership.orm-entity';
import { TypeOrmMembershipRepository } from './typeorm-membership.repository';

describe('TypeOrmMembershipRepository', () => {
  function buildQueryBuilder() {
    return {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      getCount: jest.fn().mockResolvedValue(0),
      getRawMany: jest.fn().mockResolvedValue([]),
    };
  }
  it('finds the earliest joined membership for a role in an organization', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const repository = new TypeOrmMembershipRepository(repo as any);

    await repository.findFirstByRole('org-1', Role.FINANCE_MANAGER);

    expect(repo.findOne).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        role: Role.FINANCE_MANAGER,
        joinedAt: expect.anything(),
      },
      order: { createdAt: 'ASC' },
    });
  });

  describe('findOwnerByOrganization', () => {
    it('excludes OWNER memberships that were invited but never joined', async () => {
      const repo = { findOne: jest.fn().mockResolvedValue(null) };
      const repository = new TypeOrmMembershipRepository(repo as any);

      await repository.findOwnerByOrganization('org-1');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: {
          organizationId: 'org-1',
          role: Role.OWNER,
          joinedAt: Not(IsNull()),
        },
        order: { createdAt: 'ASC' },
      });
    });
  });

  it('maps persisted membership state into the domain entity', async () => {
    const row = {
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      status: 'BLOCKED' as const,
      blockedAt: new Date('2026-08-02'),
      createdAt: new Date('2026-08-01'),
    };
    const repo = { findOne: jest.fn().mockResolvedValue(row) };
    const repository = new TypeOrmMembershipRepository(repo as any);

    const membership = await repository.findByUserAndOrganization(
      'user-1',
      'org-1',
    );

    expect(membership).toEqual(new Membership(row));
  });

  it('maps the domain entity to an ORM entity before saving', async () => {
    const repo = { save: jest.fn().mockResolvedValue(undefined) };
    const repository = new TypeOrmMembershipRepository(repo as any);
    const membership = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      status: 'BLOCKED',
      blockedAt: new Date('2026-08-02'),
      createdAt: new Date('2026-08-01'),
    });

    await repository.save(membership);

    expect(repo.save).toHaveBeenCalledWith(expect.any(MembershipOrmEntity));
    expect(repo.save.mock.calls[0][0]).toMatchObject(membership);
  });

  describe('findPageByOrganization', () => {
    const row = {
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      status: 'ACTIVE',
      blockedAt: null,
      createdAt: new Date('2026-08-01'),
    };

    it('scopes by organization, requires a joined membership, and paginates', async () => {
      const qb = buildQueryBuilder();
      qb.getMany.mockResolvedValue([row]);
      const repo = { createQueryBuilder: jest.fn().mockReturnValue(qb) };
      const repository = new TypeOrmMembershipRepository(repo as any);

      const result = await repository.findPageByOrganization('org-1', 2, 20);

      expect(repo.createQueryBuilder).toHaveBeenCalledWith('membership');
      expect(qb.where).toHaveBeenCalledWith(
        'membership.organizationId = :organizationId',
        { organizationId: 'org-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'membership.joinedAt IS NOT NULL',
      );
      expect(qb.orderBy).toHaveBeenCalledWith('membership.createdAt', 'ASC');
      expect(qb.skip).toHaveBeenCalledWith(20);
      expect(qb.take).toHaveBeenCalledWith(20);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('mem-1');
    });

    it('filters by status and user IDs when provided', async () => {
      const qb = buildQueryBuilder();
      const repository = new TypeOrmMembershipRepository({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as any);

      await repository.findPageByOrganization('org-1', 1, 20, {
        status: 'BLOCKED',
        userIds: ['user-1', 'user-2'],
      });

      expect(qb.andWhere).toHaveBeenCalledWith('membership.status = :status', {
        status: 'BLOCKED',
      });
      expect(qb.andWhere).toHaveBeenCalledWith(
        'membership.userId IN (:...userIds)',
        { userIds: ['user-1', 'user-2'] },
      );
    });

    it('matches no rows when the user-ID filter is empty', async () => {
      const qb = buildQueryBuilder();
      const repository = new TypeOrmMembershipRepository({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as any);

      await repository.findPageByOrganization('org-1', 1, 20, {
        userIds: [],
      });

      expect(qb.andWhere).toHaveBeenCalledWith('1 = 0');
      expect(qb.andWhere).not.toHaveBeenCalledWith(
        expect.stringContaining('IN (:...userIds)'),
        expect.anything(),
      );
    });
  });

  describe('countByOrganization', () => {
    it('counts joined memberships with the same organization scope and filters', async () => {
      const qb = buildQueryBuilder();
      qb.getCount.mockResolvedValue(3);
      const repository = new TypeOrmMembershipRepository({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as any);

      const total = await repository.countByOrganization('org-1', {
        status: 'ACTIVE',
      });

      expect(qb.where).toHaveBeenCalledWith(
        'membership.organizationId = :organizationId',
        { organizationId: 'org-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        'membership.joinedAt IS NOT NULL',
      );
      expect(qb.andWhere).toHaveBeenCalledWith('membership.status = :status', {
        status: 'ACTIVE',
      });
      expect(qb.getCount).toHaveBeenCalled();
      expect(total).toBe(3);
    });
  });

  describe('findUserIdsByOrganizationSearch', () => {
    it('joins users, scopes by organization, and returns matching user IDs', async () => {
      const qb = buildQueryBuilder();
      qb.getRawMany.mockResolvedValue([
        { userId: 'user-1' },
        { userId: 'user-2' },
      ]);
      const repository = new TypeOrmMembershipRepository({
        createQueryBuilder: jest.fn().mockReturnValue(qb),
      } as any);

      const result = await repository.findUserIdsByOrganizationSearch(
        'org-1',
        'acme',
      );

      expect(qb.innerJoin).toHaveBeenCalledWith(
        'users',
        'user',
        'user.id = membership.userId',
      );
      expect(qb.where).toHaveBeenCalledWith(
        'membership.organizationId = :organizationId',
        { organizationId: 'org-1' },
      );
      expect(qb.andWhere).toHaveBeenCalledWith(
        '(user.name ILIKE :pattern OR user.email ILIKE :pattern)',
        { pattern: '%acme%' },
      );
      expect(qb.getRawMany).toHaveBeenCalled();
      expect(result).toEqual(['user-1', 'user-2']);
    });
  });
});
