import { Permission, Role } from '@casso-ledger/shared-types';
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
});
