export interface IMemberNotificationSender {
  sendMemberBlockedEmail(to: string, organizationName: string): Promise<void>;
  sendMemberUnblockedEmail(to: string, organizationName: string): Promise<void>;
}

export const MEMBER_NOTIFICATION_SENDER = Symbol('MEMBER_NOTIFICATION_SENDER');
