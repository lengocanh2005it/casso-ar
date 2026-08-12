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
          organizationId: true,
          email: true,
          role: true,
          invitedByUserId: true,
          expiresAt: true,
          acceptedAt: true,
          createdAt: true,
        },
      }),
    );
    expect(find.mock.calls[0][0].select).not.toHaveProperty('tokenHash');
  });
});
