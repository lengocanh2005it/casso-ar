import { SetMetadata } from '@nestjs/common';
import type { Permission } from './permission.enum';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
