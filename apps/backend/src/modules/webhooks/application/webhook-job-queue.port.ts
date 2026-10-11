export interface WebhookJobQueueInput {
  webhookInboxId: string;
  organizationId: string;
  jobId: string;
}

/**
 * `enqueued` means a new attempt was scheduled. `deduped` means an attempt for
 * that job id is already pending or active, so no second attempt was created.
 */
export type WebhookJobEnqueueResult = 'enqueued' | 'deduped';

export interface IWebhookJobQueue {
  enqueue(input: WebhookJobQueueInput): Promise<WebhookJobEnqueueResult>;
}

export const WEBHOOK_JOB_QUEUE = Symbol('WEBHOOK_JOB_QUEUE');
