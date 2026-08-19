import type { ExecutionContext } from '@nestjs/common';
import { Organization } from '../domain/organization';
import { OrganizationLockGuard } from './organization-lock.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

describe('OrganizationLockGuard', () => {
  function buildGuard(organization: Organization | null) {
    const organizationRepo = {
      findById: jest.fn().mockResolvedValue(organization),
    };
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    return new OrganizationLockGuard(organizationRepo as any, reflector as any);
  }

  it('rejects with ORGANIZATION_LOCKED when the caller organization is LOCKED', async () => {
    const guard = buildGuard(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'LOCKED',
        createdAt: new Date(),
      }),
    );
    const request = {
      user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' },
    };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toMatchObject({ response: { errorCode: 'ORGANIZATION_LOCKED' } });
  });

  it('allows the request when the caller organization is ACTIVE', async () => {
    const guard = buildGuard(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'ACTIVE',
        createdAt: new Date(),
      }),
    );
    const request = {
      user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' },
    };

    await expect(guard.canActivate(buildContext(request))).resolves.toBe(true);
  });

  it('allows unauthenticated requests through (JwtAuthGuard rejects those first)', async () => {
    const guard = buildGuard(null);
    await expect(guard.canActivate(buildContext({}))).resolves.toBe(true);
  });

  it('rejects with ORGANIZATION_PENDING_REVIEW when the caller organization is pending review', async () => {
    const guard = buildGuard(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'PENDING_REVIEW',
        createdAt: new Date(),
      }),
    );
    const request = {
      user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' },
    };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toMatchObject({
      response: { errorCode: 'ORGANIZATION_PENDING_REVIEW' },
    });
  });

  it('rejects with ORGANIZATION_REJECTED when the caller organization was rejected', async () => {
    const guard = buildGuard(
      new Organization({
        id: 'org-1',
        name: 'Acme',
        status: 'REJECTED',
        createdAt: new Date(),
      }),
    );
    const request = {
      user: { userId: 'u1', organizationId: 'org-1', role: 'OWNER' },
    };

    await expect(
      guard.canActivate(buildContext(request)),
    ).rejects.toMatchObject({
      response: { errorCode: 'ORGANIZATION_REJECTED' },
    });
  });
});
