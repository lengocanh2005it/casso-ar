import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { ErrorCode } from '../errors/error-code';
import { REQUIRED_PERMISSION_KEY } from './require-permission.decorator';
import { ROLE_PERMISSIONS } from './role-permissions.map';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = this.reflector.getAllAndOverride(
      REQUIRED_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermission) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;

    if (
      !user ||
      !(ROLE_PERMISSIONS[user.role] ?? []).includes(requiredPermission)
    ) {
      throw new ForbiddenException({
        errorCode: ErrorCode.FORBIDDEN,
        message: 'Bạn không có quyền thực hiện thao tác này.',
      });
    }

    return true;
  }
}
