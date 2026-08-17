import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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

/**
 * Bearer header only. The frontend's realtime alert stream (GET /alerts/stream)
 * is a fetch-based SSE polyfill that sends the Authorization header like any
 * other request — there is no ?token= fallback because putting a live access
 * token in the URL would leak it into access logs, browser history and
 * Referer headers (CWE-598).
 */
export function extractJwtFromRequest(request: Request): string | null {
  return ExtractJwt.fromAuthHeaderAsBearerToken()(request);
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: extractJwtFromRequest,
      ignoreExpiration: false,
      passReqToCallback: true,
      secretOrKey: getJwtSecret(config),
      algorithms: ['HS256'],
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
