import type { Repository } from 'typeorm';
import { FindOperator, ILike, IsNull } from 'typeorm';
import { MembershipInviteOrmEntity } from './membership-invite.orm-entity';
import { TypeOrmMembershipInviteRepository } from './typeorm-membership-invite.repository';

describe('TypeOrmMembershipInviteRepository', () => {
  it('selects only fields needed for pending invite responses', async () => {
    const find = jest.fn().mockResolvedValue([]);
    const repository = {
      find,
    } as unknown as Repository<MembershipInviteOrmEntity>;
    const sut = new TypeOrmMembershipInviteRepository(repository);

    await sut.findPendingPageByOrganization('org-1', 1, 20);

    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        select: {
          id: true,
          email: true,
          role: true,
          createdAt: true,
          expiresAt: true,
        },
      }),
    );
    expect(find.mock.calls[0][0].select).not.toHaveProperty('tokenHash');
  });

  it('maps rows to PendingInviteSummary without a fake tokenHash', async () => {
    const find = jest.fn().mockResolvedValue([
      {
        id: 'inv-1',
        email: 'moi@congtyb.vn',
        role: 'VIEWER',
        createdAt: new Date('2026-08-12'),
        expiresAt: new Date('2026-08-19'),
      },
    ]);
    const repository = {
      find,
    } as unknown as Repository<MembershipInviteOrmEntity>;
    const sut = new TypeOrmMembershipInviteRepository(repository);

    const result = await sut.findPendingPageByOrganization('org-1', 1, 20);

    expect(result).toEqual([
      {
        id: 'inv-1',
        email: 'moi@congtyb.vn',
        role: 'VIEWER',
        createdAt: new Date('2026-08-12'),
        expiresAt: new Date('2026-08-19'),
      },
    ]);
    expect(result[0]).not.toHaveProperty('tokenHash');
  });

  describe('pending invite search', () => {
    it('searches pending invites by email with an escaped, case-insensitive pattern', async () => {
      const find = jest.fn().mockResolvedValue([]);
      const repository = {
        find,
      } as unknown as Repository<MembershipInviteOrmEntity>;
      const sut = new TypeOrmMembershipInviteRepository(repository);

      await sut.findPendingPageByOrganization('org-1', 1, 20, '  a%b  ');

      const { where } = find.mock.calls[0][0];
      expect(where).toMatchObject({
        organizationId: 'org-1',
        acceptedAt: expect.anything(),
      });
      expect(where.email).toBeInstanceOf(FindOperator);
      expect((where.email as FindOperator<string>).value).toBe('%a\\%b%');
    });

    it('counts pending invites with an optional email search', async () => {
      const count = jest.fn().mockResolvedValue(0);
      const repository = {
        count,
      } as unknown as Repository<MembershipInviteOrmEntity>;
      const sut = new TypeOrmMembershipInviteRepository(repository);

      await sut.countPendingByOrganization('org-1', 'acme');

      const { where } = count.mock.calls[0][0];
      expect(where).toMatchObject({
        organizationId: 'org-1',
        acceptedAt: expect.anything(),
      });
      expect(where.email).toEqual(ILike('%acme%'));
    });
  });
});
