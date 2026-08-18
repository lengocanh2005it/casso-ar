export interface ChangePasswordOtp {
  id: string;
  userId: string;
  otpHash: string;
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
}
