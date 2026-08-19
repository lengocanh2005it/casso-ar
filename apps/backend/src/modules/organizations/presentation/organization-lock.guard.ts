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

const ERROR_CODE_BY_STATUS: Partial<Record<OrganizationStatus, ErrorCode>> = {
  LOCKED: ErrorCode.ORGANIZATION_LOCKED,
  PENDING_REVIEW: ErrorCode.ORGANIZATION_PENDING_REVIEW,
  REJECTED: ErrorCode.ORGANIZATION_REJECTED,
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
    const errorCode = organization && ERROR_CODE_BY_STATUS[organization.status];
    if (errorCode) {
      throw new ForbiddenException({
        errorCode,
        message: 'Tổ chức của bạn hiện không thể sử dụng dịch vụ.',
      });
    }
    return true;
  }
}
