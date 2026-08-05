import { HttpException, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
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
      throw new HttpException(
        {
          statusCode: 400,
          errorCode: ErrorCode.VALIDATION_ERROR,
          message: 'Mã xác thực email không hợp lệ hoặc đã hết hạn.',
        },
        400,
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const user = await this.userRepo.findById(token.userId, manager);
      if (!user) {
        throw new HttpException(
          {
            statusCode: 404,
            errorCode: ErrorCode.NOT_FOUND,
            message: 'Không tìm thấy người dùng.',
          },
          404,
        );
      }
      await this.userRepo.save(user.markEmailVerified(), manager);
      await this.tokenRepo.deleteById(token.id, manager);
    });
  }
}
