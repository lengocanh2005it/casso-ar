import type { ExecutionContext } from '@nestjs/common';
import { Membership, Role } from '../domain/membership';
import { MembershipBlockGuard } from './membership-block.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

function buildMembership(status: 'ACTIVE' | 'BLOCKED') {
  return new Membership({
    id: 'mem-1',
    organizationId: 'org-1',
    userId: 'user-1',
    role: Role.ACCOUNTANT,
    invitedAt: new Date('2026-08-01'),
    joinedAt: new Date('2026-08-01'),
    createdAt: new Date('2026-08-01'),
    status,
    blockedAt: status === 'BLOCKED' ? new Date('2026-08-05') : null,
  });
}

describe('MembershipBlockGuard', () => {
  function buildGuard(membership: Membership | null) {
    const membershipRepo = {
      findByUserAndOrganization: jest.fn().mockResolvedValue(membership),
    };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    return new MembershipBlockGuard(membershipRepo as any, reflector as any);
  }

  it('rejects with MEMBER_BLOCKED when the caller membership is BLOCKED', async () => {
    const guard = buildGuard(buildMembership('BLOCKED'));
    const request = {
      user: { userId: 'user-1', organizationId: 'org-1', role: 'ACCOUNTANT' },
    };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toMatchObject({ response: { errorCode: 'MEMBER_BLOCKED' } });
  });

  it('allows the request when the caller membership is ACTIVE', async () => {
    const guard = buildGuard(buildMembership('ACTIVE'));
    const request = {
      user: { userId: 'user-1', organizationId: 'org-1', role: 'ACCOUNTANT' },
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
  });

  it('allows unauthenticated requests through (JwtAuthGuard rejects those first)', async () => {
    const guard = buildGuard(null);
    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
  });

  it('allows public routes through without checking membership', async () => {
    const membershipRepo = { findByUserAndOrganization: jest.fn() };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
    const guard = new MembershipBlockGuard(
      membershipRepo as any,
      reflector as any,
    );

    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
    expect(membershipRepo.findByUserAndOrganization).not.toHaveBeenCalled();
  });
});
