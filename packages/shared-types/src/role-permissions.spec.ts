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

  it('grants BANK_CONNECTION_REVEAL_KEY to OWNER and FINANCE_MANAGER only', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
      Permission.BANK_CONNECTION_REVEAL_KEY,
    );
  });
  it('grants OWNERSHIP_TRANSFER_MANAGE only to OWNER', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(
      Permission.OWNERSHIP_TRANSFER_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).not.toContain(
      Permission.OWNERSHIP_TRANSFER_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.OWNERSHIP_TRANSFER_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.OWNERSHIP_TRANSFER_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
      Permission.OWNERSHIP_TRANSFER_MANAGE,
    );
  });
});
