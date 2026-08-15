import { IsNull, Not } from 'typeorm';
import { Membership, Role } from '../domain/membership';
import { MembershipOrmEntity } from './membership.orm-entity';
import { TypeOrmMembershipRepository } from './typeorm-membership.repository';

describe('TypeOrmMembershipRepository', () => {
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
});
