export interface WebhookJobQueueInput {
  webhookInboxId: string;
  organizationId: string;
  /**
   * Deterministic dedup key (e.g. `webhook-reprocess-<inboxId>`). BullMQ holds
   * it while an attempt for that key is in flight and releases it when the
   * attempt completes or fails, so it is the identity used for deduplication —
   * not the concrete BullMQ job id, which the adapter makes attempt-specific.
   */
  jobId: string;
}

/**
 * `enqueued` means a new attempt was scheduled. `deduped` means an attempt for
 * that dedup key is already pending or active, so no second attempt was created.
 */
export type WebhookJobEnqueueResult = 'enqueued' | 'deduped';

export interface IWebhookJobQueue {
  enqueue(input: WebhookJobQueueInput): Promise<WebhookJobEnqueueResult>;
}

export const WEBHOOK_JOB_QUEUE = Symbol('WEBHOOK_JOB_QUEUE');
