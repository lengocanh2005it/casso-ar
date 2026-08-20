import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CHANGE_PASSWORD_OTP_REPOSITORY,
  type IChangePasswordOtpRepository,
} from '../../profile/application/change-password-otp-repository.port';
import { hashPassword } from './password-hasher';
import {
  type IRefreshTokenRepository,
  REFRESH_TOKEN_REPOSITORY,
} from './refresh-token-repository.port';

@Injectable()
export class ChangePasswordConfirmUseCase {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(CHANGE_PASSWORD_OTP_REPOSITORY)
    private readonly otpRepo: IChangePasswordOtpRepository,
    @Inject(REFRESH_TOKEN_REPOSITORY)
    private readonly refreshTokenRepo: IRefreshTokenRepository,
  ) {}

  async execute(
    userId: string,
    otp: string,
    newPassword: string,
  ): Promise<void> {
    if (!/^\d{6}$/.test(otp)) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, 'OTP phải là 6 chữ số');
    }

    if (newPassword.length < 8 || newPassword.length > 128) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Mật khẩu mới phải từ 8-128 ký tự',
      );
    }

    const otpHash = createHash('sha256').update(otp).digest('hex');
    const otpRecord = await this.otpRepo.findValidOtp(userId, otpHash);

    if (!otpRecord) {
      throw new AppError(
        ErrorCode.UNAUTHORIZED,
        'OTP không hợp lệ hoặc đã hết hạn',
      );
    }

    if (new Date() > otpRecord.expiresAt) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'OTP đã hết hạn');
    }

    const newHash = await hashPassword(newPassword);

    // A password change is a "log everyone else out" event, same as
    // reset-password.usecase.ts — otherwise a compromised session survives
    // the very action meant to invalidate it.
    await this.dataSource.transaction(async (manager) => {
      await this.otpRepo.markUsed(otpRecord.id);
      await manager.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
        newHash,
        userId,
      ]);
      await this.refreshTokenRepo.revokeAllForUser(userId, manager);
    });
  }
}
