import { Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { JwtService } from '@nestjs/jwt';
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
      throw new Error('User is not a member of this organization');
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
