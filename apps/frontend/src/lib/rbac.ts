import { Permission, ROLE_PERMISSIONS, Role } from '@casso-ar/shared-types';

function isRole(value: string): value is Role {
  return Object.values(Role).includes(value as Role);
}

export function hasPermission(
  role: Role | string | null | undefined,
  permission: Permission,
): boolean {
  if (!role || !isRole(role)) return false;
  return ROLE_PERMISSIONS[role].includes(permission);
}
