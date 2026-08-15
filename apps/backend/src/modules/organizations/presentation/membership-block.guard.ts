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
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../application/membership-repository.port';

@Injectable()
export class MembershipBlockGuard implements CanActivate {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
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

    const membership = await this.membershipRepo.findByUserAndOrganization(
      user.userId,
      user.organizationId,
    );
    if (membership?.isBlocked()) {
      throw new ForbiddenException({
        errorCode: ErrorCode.MEMBER_BLOCKED,
        message: 'Quyền truy cập của bạn vào tổ chức này đã bị chặn.',
      });
    }
    return true;
  }
}
