export interface IAuthEmailSender {
  sendVerificationEmail(to: string, verifyUrl: string): Promise<void>;
  sendPasswordResetEmail(to: string, resetUrl: string): Promise<void>;
  sendInviteEmail(
    to: string,
    acceptUrl: string,
    organizationName: string,
  ): Promise<void>;
  sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>;
  sendMemberUnblockedEmail(to: string, organizationName: string): Promise<void>;
}

export const AUTH_EMAIL_SENDER = Symbol('AUTH_EMAIL_SENDER');
