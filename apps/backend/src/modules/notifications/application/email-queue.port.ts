import type { EmailAttachment } from '../../../common/email/email-attachment';

export interface EmailAttachmentRef {
  storageKey: string;
  filename: string;
  mimeType: string;
}

export interface ReminderEmailJob {
  reminderExecutionId: string;
  receivableId: string;
  organizationId: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  forceProvider?: 'RESEND';
  fromName?: string;
  attachmentRefs?: EmailAttachmentRef[];
}

export interface AuthEmailJob {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
  emailType:
    | 'AUTH_VERIFICATION'
    | 'AUTH_PASSWORD_RESET'
    | 'AUTH_INVITE'
    | 'AUTH_CHANGE_PASSWORD_OTP'
    | 'MEMBER_BLOCKED'
    | 'MEMBER_UNBLOCKED'
    | 'ORGANIZATION_APPROVED'
    | 'ORGANIZATION_REJECTED'
    | 'OWNERSHIP_TRANSFER_OTP'
    | 'OWNERSHIP_TRANSFER_PENDING';
}

export interface OwnerAlertEmailJob {
  organizationId: string;
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: EmailAttachment[];
}

export interface IEmailQueue {
  add(
    name: 'send-reminder-email',
    data: ReminderEmailJob,
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
  add(
    name: 'send-auth-email',
    data: AuthEmailJob,
    options?: {
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
  add(
    name: 'send-owner-alert',
    data: OwnerAlertEmailJob,
    options?: {
      jobId?: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
}

export const EMAIL_QUEUE_PORT = Symbol('EMAIL_QUEUE_PORT');
