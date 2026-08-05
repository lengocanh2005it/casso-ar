import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
import { AuthError } from '../../../common/errors/auth.error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';

@Injectable()
export class SwitchOrganizationUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    private readonly jwtService: JwtService,
  ) {}

  async execute(
    userId: string,
    organizationId: string,
  ): Promise<{ accessToken: string }> {
    const membership = await this.membershipRepo.findByUserAndOrganization(
      userId,
      organizationId,
    );
    if (!membership?.isActive()) {
      throw new AuthError(
        403,
        ErrorCode.FORBIDDEN,
        'Người dùng không thuộc tổ chức này.',
      );
    }
    return {
      accessToken: this.jwtService.sign({
        userId,
        organizationId,
        role: membership.role,
      }),
    };
  }
}
