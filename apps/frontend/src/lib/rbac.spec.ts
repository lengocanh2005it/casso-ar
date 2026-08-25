import { Permission, Role } from '@casso-ar/shared-types';
import { describe, expect, it } from 'vitest';
import { hasPermission } from './rbac';

describe('hasPermission', () => {
  it('allows an owner to write off receivables', () => {
    expect(hasPermission(Role.OWNER, Permission.RECEIVABLE_WRITE_OFF)).toBe(
      true,
    );
  });

  it('denies a viewer permission to write off receivables', () => {
    expect(hasPermission(Role.VIEWER, Permission.RECEIVABLE_WRITE_OFF)).toBe(
      false,
    );
  });

  it('denies permissions when the role is missing or unknown', () => {
    expect(hasPermission(null, Permission.RECEIVABLE_READ)).toBe(false);
    expect(hasPermission('UNKNOWN_ROLE', Permission.RECEIVABLE_READ)).toBe(
      false,
    );
  });

  it.each([
    [Role.OWNER, true],
    [Role.FINANCE_MANAGER, true],
    [Role.ACCOUNTANT, false],
    [Role.SALES_REP, false],
    [Role.VIEWER, false],
  ])(
    'grants receivable audit read only to owner and finance manager for %s',
    (role, expected) => {
      expect(hasPermission(role, Permission.RECEIVABLE_AUDIT_READ)).toBe(
        expected,
      );
    },
  );
});
