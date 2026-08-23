export interface IMemberNotificationSender {
  sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>;
  sendMemberUnblockedEmail(to: string, organizationName: string): Promise<void>;
  sendOrganizationApprovedEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
  sendOrganizationRejectedEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
  sendOwnershipTransferOtpEmail(to: string, otp: string): Promise<void>;
  sendOwnershipTransferPendingEmail(
    to: string,
    organizationName: string,
  ): Promise<void>;
}

export const MEMBER_NOTIFICATION_SENDER = Symbol('MEMBER_NOTIFICATION_SENDER');
