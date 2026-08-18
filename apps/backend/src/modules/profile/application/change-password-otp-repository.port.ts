import type { ChangePasswordOtp } from '../domain/change-password-otp';

export const CHANGE_PASSWORD_OTP_REPOSITORY = Symbol(
  'CHANGE_PASSWORD_OTP_REPOSITORY',
);

export interface IChangePasswordOtpRepository {
  create(data: {
    userId: string;
    otpHash: string;
    expiresAt: Date;
  }): Promise<ChangePasswordOtp>;
  findValidOtp(
    userId: string,
    otpHash: string,
  ): Promise<ChangePasswordOtp | null>;
  markUsed(id: string): Promise<void>;
  invalidatePrevious(userId: string): Promise<void>;
}
