import { Membership, Role } from '../domain/membership';
import { assertNotLastOwner } from './assert-not-last-owner';

function buildMembership(
  overrides: Partial<ConstructorParameters<typeof Membership>[0]> = {},
) {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.OWNER,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    ...overrides,
  });
}

describe('assertNotLastOwner', () => {
  it('passes the transaction manager through so the owner count is row-locked', async () => {
    const manager = { name: 'tx-manager' };
    const membershipRepo = {
      countActiveByRole: jest.fn().mockResolvedValue(2),
    };

    await assertNotLastOwner(
      membershipRepo as never,
      'org-1',
      buildMembership(),
      manager as never,
    );

    expect(membershipRepo.countActiveByRole).toHaveBeenCalledWith(
      'org-1',
      Role.OWNER,
      manager,
    );
  });

  it('rejects when the locked count is 1 or fewer', async () => {
    const membershipRepo = {
      countActiveByRole: jest.fn().mockResolvedValue(1),
    };

    await expect(
      assertNotLastOwner(
        membershipRepo as never,
        'org-1',
        buildMembership(),
        {} as never,
      ),
    ).rejects.toMatchObject({ errorCode: 'CONFLICT' });
  });
});
