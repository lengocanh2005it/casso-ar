import { Membership, Role } from './membership';

describe('Membership domain entity', () => {
  it('holds the 5 static roles defined by the spec', () => {
    expect(Object.values(Role)).toEqual([
      'OWNER',
      'FINANCE_MANAGER',
      'ACCOUNTANT',
      'SALES_REP',
      'VIEWER',
    ]);
  });

  it('creates a membership with joinedAt set for an active member', () => {
    const membership = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.OWNER,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });

    expect(membership.role).toBe(Role.OWNER);
    expect(membership.joinedAt).not.toBeNull();
    expect(membership.isActive()).toBe(true);
  });

  it('returns a new membership with the updated role', () => {
    const membership = new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.OWNER,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
    });

    const updated = membership.withRole(Role.VIEWER);

    expect(updated).not.toBe(membership);
    expect(updated.role).toBe(Role.VIEWER);
    expect(updated.userId).toBe('user-1');
    expect(membership.role).toBe(Role.OWNER);
  });
});
