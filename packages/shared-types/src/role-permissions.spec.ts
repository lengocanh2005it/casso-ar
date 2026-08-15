import { Permission } from './permission';
import { Role } from './role';
import { ROLE_PERMISSIONS } from './role-permissions';

describe('ROLE_PERMISSIONS', () => {
  it('grants ALERT_READ only to OWNER', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(Permission.ALERT_READ);
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).not.toContain(
      Permission.ALERT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.ALERT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.ALERT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(Permission.ALERT_READ);
  });

  it('grants MEMBER_BLOCK only to OWNER', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(Permission.MEMBER_BLOCK);
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
      Permission.MEMBER_BLOCK,
    );
  });
});
