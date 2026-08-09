import { IsNull, Not } from 'typeorm';
import { Role } from '../domain/membership';
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
});
