import type { Permission } from '@casso-ledger/shared-types';
import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_KEY = 'requiredPermission';
export const RequirePermission = (permission: Permission) =>
  SetMetadata(REQUIRED_PERMISSION_KEY, permission);
