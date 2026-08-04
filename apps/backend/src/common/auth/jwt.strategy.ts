import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import type { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from '../../config/jwt.config';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../modules/organizations/application/membership-repository.port';
import { ErrorCode } from '../errors/error-code';
import type { AuthenticatedUser } from './authenticated-user';

interface JwtPayload {
  userId: string;
  organizationId: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(
    request: Request,
    payload: JwtPayload,
  ): Promise<AuthenticatedUser> {
    const organizationId =
      request.header('X-Organization-Id')?.trim() || payload.organizationId;
    const membership = await this.membershipRepo.findByUserAndOrganization(
      payload.userId,
      organizationId,
    );
    if (!membership?.isActive()) {
      throw new UnauthorizedException({
        errorCode: ErrorCode.UNAUTHORIZED,
        message: 'Bạn chưa đăng nhập hoặc phiên đăng nhập đã hết hạn.',
      });
    }
    return {
      userId: payload.userId,
      organizationId,
      role: membership.role,
    };
  }
}
