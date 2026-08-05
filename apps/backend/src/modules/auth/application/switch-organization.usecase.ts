import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { type ITokenSigner, TOKEN_SIGNER } from './token-signer.port';

@Injectable()
export class SwitchOrganizationUseCase {
  constructor(
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(TOKEN_SIGNER) private readonly tokenSigner: ITokenSigner,
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
      throw new AppError(
        ErrorCode.FORBIDDEN,
        'Người dùng không thuộc tổ chức này.',
      );
    }
    return {
      accessToken: this.tokenSigner.sign({
        userId,
        organizationId,
        role: membership.role,
      }),
    };
  }
}
