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
import { hashToken } from './token-hasher';

@Injectable()
export class VerifyEmailUseCase {
  constructor(
    @Inject(EMAIL_VERIFICATION_TOKEN_REPOSITORY)
    private readonly tokenRepo: IEmailVerificationTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(rawToken: string): Promise<void> {
    const token = await this.tokenRepo.findByTokenHash(hashToken(rawToken));
    if (!token || token.isExpired(new Date())) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Mã xác thực email không hợp lệ hoặc đã hết hạn.',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const user = await this.userRepo.findById(token.userId, manager);
      if (!user) {
        throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng.');
      }
      await this.userRepo.save(user.markEmailVerified(), manager);
      await this.tokenRepo.deleteById(token.id, manager);
    });
  }
}
