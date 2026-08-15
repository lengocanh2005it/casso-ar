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

describe('Membership block/unblock', () => {
  function buildMembership(overrides: Partial<Membership> = {}): Membership {
    return new Membership({
      id: 'mem-1',
      organizationId: 'org-1',
      userId: 'user-1',
      role: Role.ACCOUNTANT,
      invitedAt: new Date('2026-08-01'),
      joinedAt: new Date('2026-08-01'),
      createdAt: new Date('2026-08-01'),
      ...overrides,
    });
  }

  it('defaults status to ACTIVE and blockedAt to null', () => {
    const membership = buildMembership();
    expect(membership.status).toBe('ACTIVE');
    expect(membership.blockedAt).toBeNull();
    expect(membership.isBlocked()).toBe(false);
  });

  it('block() sets status to BLOCKED and blockedAt to a Date', () => {
    const membership = buildMembership();
    const blocked = membership.block();
    expect(blocked).not.toBe(membership);
    expect(blocked.status).toBe('BLOCKED');
    expect(blocked.blockedAt).toBeInstanceOf(Date);
    expect(blocked.isBlocked()).toBe(true);
    expect(membership.status).toBe('ACTIVE');
  });

  it('unblock() sets status to ACTIVE and blockedAt to null', () => {
    const membership = buildMembership({
      status: 'BLOCKED',
      blockedAt: new Date('2026-08-10'),
    });
    const unblocked = membership.unblock();
    expect(unblocked.status).toBe('ACTIVE');
    expect(unblocked.blockedAt).toBeNull();
    expect(unblocked.isBlocked()).toBe(false);
  });

  it('block() applies the same way regardless of joinedAt (pending invite included)', () => {
    const pending = buildMembership({ joinedAt: null });
    const blocked = pending.block();
    expect(blocked.isBlocked()).toBe(true);
    expect(blocked.isActive()).toBe(false);
  });
});
