import type { Repository } from 'typeorm';
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
});
