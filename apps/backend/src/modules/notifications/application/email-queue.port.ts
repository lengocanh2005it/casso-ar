export interface ReminderEmailJob {
  reminderExecutionId: string;
  receivableId: string;
  organizationId: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  forceProvider?: 'RESEND';
}

export interface AuthEmailJob {
  to: string;
  subject: string;
  html: string;
  emailType: 'AUTH_VERIFICATION' | 'AUTH_PASSWORD_RESET' | 'AUTH_INVITE';
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
}

export const EMAIL_QUEUE_PORT = Symbol('EMAIL_QUEUE_PORT');
