import { Role } from '../../organizations/domain/membership';
import { MembershipInvite } from '../domain/membership-invite';
import { ListInvitesUseCase } from './list-invites.usecase';

function buildInvite(
  overrides: Partial<ConstructorParameters<typeof MembershipInvite>[0]> = {},
) {
  return new MembershipInvite({
    id: 'inv-1',
    organizationId: 'org-1',
    email: 'moi@congtyb.vn',
    role: Role.VIEWER,
    invitedByUserId: 'user-1',
    tokenHash: 'hash',
    expiresAt: new Date('2026-08-20'),
    acceptedAt: null,
    createdAt: new Date('2026-08-12'),
    ...overrides,
  });
}

describe('ListInvitesUseCase', () => {
  it('lists pending invites for the caller organization', async () => {
    const invite = buildInvite();
    const inviteRepo = {
      findPendingPageByOrganization: jest.fn().mockResolvedValue([invite]),
      countPendingByOrganization: jest.fn().mockResolvedValue(1),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new ListInvitesUseCase(
      inviteRepo as never,
      tenantContext as never,
    );

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(inviteRepo.findPendingPageByOrganization).toHaveBeenCalledWith(
      'org-1',
      1,
      20,
    );
    expect(inviteRepo.countPendingByOrganization).toHaveBeenCalledWith('org-1');
    expect(result).toEqual({ items: [invite], total: 1, page: 1, limit: 20 });
  });
});
