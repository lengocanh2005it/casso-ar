export enum Role {
  OWNER = 'OWNER',
  FINANCE_MANAGER = 'FINANCE_MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',
  SALES_REP = 'SALES_REP',
  VIEWER = 'VIEWER',
}

export const INVITABLE_ROLES = Object.values(Role).filter(
  (role): role is Exclude<Role, Role.OWNER> => role !== Role.OWNER,
);
