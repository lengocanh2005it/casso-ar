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
import { hashOtp } from './token-hasher';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokenRepo: IEmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly dataSource: DataSource,
    private readonly loginUseCase: LoginUseCase,
  ) {}

  async execute(email: string, otp: string): Promise<LoginResult> {
    const user = await this.userRepo.findByEmail(email.trim().toLowerCase());
    const token = user
      ? await this.tokenRepo.findByUserIdAndTokenHash(user.id, hashOtp(otp))
      : null;

    if (!user || !token || token.isExpired(new Date())) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'Mã xác thực không hợp lệ hoặc đã hết hạn.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      await this.userRepo.save(user.markEmailVerified(), manager);
      await this.tokenRepo.deleteById(token.id, manager);
    });

    return this.loginUseCase.executeForUser(user.id);
  }
}
