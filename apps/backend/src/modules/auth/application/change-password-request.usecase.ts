import { createHash, randomInt } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  CHANGE_PASSWORD_OTP_REPOSITORY,
  type IChangePasswordOtpRepository,
} from '../../profile/application/change-password-otp-repository.port';
import { comparePassword } from './password-hasher';

@Injectable()
export class ChangePasswordRequestUseCase {
  private readonly logger = new Logger(ChangePasswordRequestUseCase.name);

  constructor(
    private readonly dataSource: DataSource,
    @Inject(CHANGE_PASSWORD_OTP_REPOSITORY)
    private readonly otpRepo: IChangePasswordOtpRepository,
  ) {}

  async execute(userId: string, currentPassword: string): Promise<void> {
    const result = await this.dataSource.query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId],
    );
    const passwordHash = result[0]?.password_hash as string | undefined;

    if (!passwordHash) {
      throw new AppError(ErrorCode.NOT_FOUND, 'Không tìm thấy người dùng');
    }

    const valid = await comparePassword(currentPassword, passwordHash);
    if (!valid) {
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Mật khẩu hiện tại không đúng',
      );
    }

    const otp = String(randomInt(100000, 999999));
    const otpHash = createHash('sha256').update(otp).digest('hex');
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await this.otpRepo.invalidatePrevious(userId);
    await this.otpRepo.create({ userId, otpHash, expiresAt });

    this.logger.log({
      message: 'Change password OTP generated',
      userId,
      otp,
    });
  }
}
