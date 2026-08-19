import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedUser } from '../../../common/auth/authenticated-user';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IOrganizationRepository,
  ORGANIZATION_REPOSITORY,
} from '../application/organization-repository.port';
import type { OrganizationStatus } from '../domain/organization';

const BLOCKED_STATUS: Partial<
  Record<OrganizationStatus, { errorCode: ErrorCode; message: string }>
> = {
  LOCKED: {
    errorCode: ErrorCode.ORGANIZATION_LOCKED,
    message: 'Tổ chức của bạn đã bị khóa.',
  },
  PENDING_REVIEW: {
    errorCode: ErrorCode.ORGANIZATION_PENDING_REVIEW,
    message: 'Tổ chức của bạn đang chờ được duyệt.',
  },
  REJECTED: {
    errorCode: ErrorCode.ORGANIZATION_REJECTED,
    message: 'Đăng ký tổ chức của bạn chưa được chấp thuận.',
  },
};

@Injectable()
export class OrganizationLockGuard implements CanActivate {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepo: IOrganizationRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user?.organizationId) return true;

    const organization = await this.organizationRepo.findById(
      user.organizationId,
    );
    const blocked = organization && BLOCKED_STATUS[organization.status];
    if (blocked) {
      throw new ForbiddenException(blocked);
    }
    return true;
  }
}
