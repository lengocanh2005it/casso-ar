import { INVITABLE_ROLES, Role } from './role';

describe('INVITABLE_ROLES', () => {
  it('excludes OWNER', () => {
    expect(INVITABLE_ROLES).not.toContain(Role.OWNER);
  });

  it('includes every other role exactly once', () => {
    expect([...INVITABLE_ROLES].sort()).toEqual(
      [
        Role.FINANCE_MANAGER,
        Role.ACCOUNTANT,
        Role.SALES_REP,
        Role.VIEWER,
      ].sort(),
    );
  });
});
