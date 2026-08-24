import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import {
  EMAIL_VERIFICATION_TOKEN_REPOSITORY,
  type IEmailVerificationTokenRepository,
} from './email-verification-token-repository.port';
import { type LoginResult, LoginUseCase } from './login.usecase';
import {
  PENDING_SIGNUP_REPOSITORY,
  type IPendingSignupRepository,
} from './pending-signup-repository.port';
import { ProvisionOrganizationUseCase } from './provision-organization.usecase';
import { hashOtp } from './token-hasher';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokenRepo: IEmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(PENDING_SIGNUP_REPOSITORY)
    private readonly pendingSignupRepo: IPendingSignupRepository,
    private readonly provisionOrganizationUseCase: ProvisionOrganizationUseCase,
    private readonly dataSource: DataSource,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  async execute(email: string, otp: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepo.findByEmail(normalizedEmail);
    const token = user
      ? await this.tokenRepo.findByUserIdAndTokenHash(user.id, hashOtp(otp))
      : null;

    if (user && token && !token.isExpired(new Date())) {
      await this.dataSource.transaction(async (manager) => {
        await this.userRepo.save(user.markEmailVerified(), manager);
        await this.tokenRepo.deleteById(token.id, manager);
      });
      return this.loginUseCase.executeForUser(user.id);
    }

    const otpHash = hashOtp(otp);
    const provisionedUserId = await this.dataSource.transaction(
      async (manager) => {
        const pendingSignup = await this.pendingSignupRepo.findByEmail(
          normalizedEmail,
          manager,
        );
        if (
          !pendingSignup ||
          pendingSignup.otpHash !== otpHash ||
          pendingSignup.isExpired(new Date())
        ) {
          throw new AppError(
            ErrorCode.UNAUTHORIZED,
            'Mã xác thực không hợp lệ hoặc đã hết hạn.',
          );
        }
        const provisioned = await this.provisionOrganizationUseCase.execute(
          {
            name: pendingSignup.name,
            email: pendingSignup.email,
            passwordHash: pendingSignup.passwordHash,
            organizationName: pendingSignup.organizationName,
            taxCode: pendingSignup.taxCode,
            taxCodeMatched: pendingSignup.taxCodeMatched,
            taxCodeLookupName: pendingSignup.taxCodeLookupName,
          },
          manager,
        );
        await this.pendingSignupRepo.delete(pendingSignup.id, manager);
        return provisioned.user.id;
      },
    );

    return this.loginUseCase.executeForUser(provisionedUserId);
  }
}
