import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { getJwtSecret } from '../../config/jwt.config';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../modules/organizations/application/membership-repository.port';
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
      secretOrKey: getJwtSecret(),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      payload.userId,
      payload.organizationId,
    );
    if (!membership || !membership.isActive()) {
      throw new UnauthorizedException(
        'Active organization membership required',
      );
    }
    return {
      userId: payload.userId,
      organizationId: payload.organizationId,
      role: membership.role,
    };
  }
}
