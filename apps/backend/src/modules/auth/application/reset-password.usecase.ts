import { HttpException, Inject, Injectable } from '@nestjs/common';
// biome-ignore lint/style/useImportType: NestJS DI resolves this constructor parameter at runtime.
import { DataSource } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { hashPassword } from './password-hasher';
import {
  type IPasswordResetTokenRepository,
  PASSWORD_RESET_TOKEN_REPOSITORY,
} from './password-reset-token-repository.port';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';
import { hashToken } from './token-hasher';

export interface ResetPasswordInput {
  token: string;
  newPassword: string;
}

@Injectable()
export class ResetPasswordUseCase {
  constructor(
    @Inject(PASSWORD_RESET_TOKEN_REPOSITORY)
    private readonly resetTokenRepo: IPasswordResetTokenRepository,
    @Inject(USER_REPOSITORY) private readonly userRepo: IUserRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(input: ResetPasswordInput): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const resetToken = await this.resetTokenRepo.findByTokenHash(
        hashToken(input.token),
        manager,
      );
      if (!resetToken?.isValid(new Date())) {
        throw new HttpException(
          {
            statusCode: 400,
            errorCode: ErrorCode.VALIDATION_ERROR,
            message: 'Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.',
          },
          400,
        );
      }

      const user = await this.userRepo.findById(resetToken.userId, manager);
      if (!user)
        throw new HttpException(
          {
            statusCode: 404,
            errorCode: ErrorCode.NOT_FOUND,
            message: 'Không tìm thấy người dùng.',
          },
          404,
        );

      const newPasswordHash = await hashPassword(input.newPassword);
      await this.userRepo.save(user.withPasswordHash(newPasswordHash), manager);
      await this.refreshTokenRepo.revokeAllForUser(resetToken.userId, manager);
      await this.resetTokenRepo.save(resetToken.markUsed(), manager);
    });
  }
}
