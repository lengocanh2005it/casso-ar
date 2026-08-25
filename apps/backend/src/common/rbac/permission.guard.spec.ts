import { Permission } from '@casso-ar/shared-types';
import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { Role } from '../../modules/organizations/domain/membership';
import { PermissionGuard } from './permission.guard';

function buildContext(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => {},
    getClass: () => {},
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  it('allows access when the role has the required permission', () => {
    const reflector = {
      getAllAndOverride: () => Permission.RECEIVABLE_WRITE_OFF,
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    const context = buildContext({
      userId: 'u1',
      organizationId: 'org-1',
      role: Role.FINANCE_MANAGER,
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies access when the role lacks the required permission', () => {
    const reflector = {
      getAllAndOverride: () => Permission.RECEIVABLE_WRITE_OFF,
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    const context = buildContext({
      userId: 'u1',
      organizationId: 'org-1',
      role: Role.ACCOUNTANT,
    });
    expect(() => guard.canActivate(context)).toThrow();
  });

  it('allows access when no @RequirePermission metadata is set', () => {
    const reflector = {
      getAllAndOverride: () => undefined,
    } as unknown as Reflector;
    const guard = new PermissionGuard(reflector);

    const context = buildContext({
      userId: 'u1',
      organizationId: 'org-1',
      role: Role.VIEWER,
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
