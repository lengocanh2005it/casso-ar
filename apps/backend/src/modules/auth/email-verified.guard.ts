import type { CanActivate, ExecutionContext } from '@nestjs/common';
import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { Reflector } from '@nestjs/core';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../users/application/user-repository.port';

interface AuthenticatedRequest {
  user?: { userId?: string };
}

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.userId;
    if (!userId) throw new UnauthorizedException();

    const user = await this.userRepo.findById(userId);
    if (!user?.isEmailVerified()) {
      throw new ForbiddenException('Email not verified');
    }
    return true;
  }
}
