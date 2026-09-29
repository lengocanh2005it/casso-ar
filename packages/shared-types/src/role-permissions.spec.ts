import { Permission } from './permission';
import { Role } from './role';
import { ROLE_PERMISSIONS } from './role-permissions';

describe('ROLE_PERMISSIONS', () => {
  it('grants SALES_REP customer read, receivable import, and report read only', () => {
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).toEqual([
      Permission.RECEIVABLE_READ,
      Permission.RECEIVABLE_IMPORT,
      Permission.REPORT_READ,
      Permission.CUSTOMER_READ,
    ]);
  });

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

  it('grants bank-connection read and management to OWNER and FINANCE_MANAGER only', () => {
    for (const permission of [
      Permission.BANK_CONNECTION_READ,
      Permission.BANK_CONNECTION_MANAGE,
    ]) {
      expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(permission);
      expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(permission);
      expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(permission);
      expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(permission);
      expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(permission);
    }
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

  it('grants WEBHOOK_INBOX_WRITE only to OWNER and FINANCE_MANAGER', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(
      Permission.WEBHOOK_INBOX_WRITE,
    );
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(
      Permission.WEBHOOK_INBOX_WRITE,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.WEBHOOK_INBOX_WRITE,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.WEBHOOK_INBOX_WRITE,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
      Permission.WEBHOOK_INBOX_WRITE,
    );
  });

  it('grants RECEIVABLE_AUDIT_READ to owner, finance manager, and viewer', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(
      Permission.RECEIVABLE_AUDIT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(
      Permission.RECEIVABLE_AUDIT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).not.toContain(
      Permission.RECEIVABLE_AUDIT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.RECEIVABLE_AUDIT_READ,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).toContain(
      Permission.RECEIVABLE_AUDIT_READ,
    );
  });
});
