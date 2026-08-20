export interface IAuthEmailSender {
  sendVerificationEmail(to: string, otp: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
  sendChangePasswordOtpEmail(to: string, otp: string): Promise<void>;
  sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void>;
}

export const AUTH_EMAIL_SENDER = Symbol('AUTH_EMAIL_SENDER');
