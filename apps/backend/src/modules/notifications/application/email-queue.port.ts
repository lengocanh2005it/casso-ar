export interface EmailQueueJob {
  reminderExecutionId: string;
  receivableId: string;
  organizationId: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
}

export interface IEmailQueue {
  add(
    name: 'send-reminder-email',
    data: EmailQueueJob,
    options: {
      jobId: string;
      attempts: number;
      backoff: { type: 'exponential'; delay: number };
    },
  ): Promise<void>;
}

export const EMAIL_QUEUE_PORT = Symbol('EMAIL_QUEUE_PORT');
