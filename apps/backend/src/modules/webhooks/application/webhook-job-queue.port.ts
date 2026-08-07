export interface WebhookJobQueueInput {
  webhookInboxId: string;
  organizationId: string;
  jobId: string;
}

export interface IWebhookJobQueue {
  enqueue(input: WebhookJobQueueInput): Promise<void>;
}

export const WEBHOOK_JOB_QUEUE = Symbol('WEBHOOK_JOB_QUEUE');
