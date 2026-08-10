import { Role } from '../../modules/organizations/domain/membership';
import { Permission } from './permission.enum';
import { ROLE_PERMISSIONS } from './role-permissions.map';

describe('ROLE_PERMISSIONS', () => {
  it('grants FINANCE_MANAGER read access to organization members, matching its existing USER_MANAGE write scope', () => {
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(
      Permission.USER_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(
      Permission.ORGANIZATION_READ,
    );
  });

  it('allows SALES_REP to import receivables assigned to themselves, without granting general receivable write', () => {
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).toContain(
      Permission.RECEIVABLE_IMPORT,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.RECEIVABLE_WRITE,
    );
  });

  it('grants bank-account management only to financial write roles', () => {
    expect(ROLE_PERMISSIONS[Role.OWNER]).toContain(
      Permission.CUSTOMER_BANK_ACCOUNT_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.FINANCE_MANAGER]).toContain(
      Permission.CUSTOMER_BANK_ACCOUNT_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.ACCOUNTANT]).toContain(
      Permission.CUSTOMER_BANK_ACCOUNT_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.SALES_REP]).not.toContain(
      Permission.CUSTOMER_BANK_ACCOUNT_MANAGE,
    );
    expect(ROLE_PERMISSIONS[Role.VIEWER]).not.toContain(
      Permission.CUSTOMER_BANK_ACCOUNT_MANAGE,
    );
  });
});
