export interface IWebhookJobQueue {
  enqueue(input: {
    webhookInboxId: string;
    organizationId: string;
    jobId: string;
  }): Promise<void>;
}

export const WEBHOOK_JOB_QUEUE = Symbol('WEBHOOK_JOB_QUEUE');
