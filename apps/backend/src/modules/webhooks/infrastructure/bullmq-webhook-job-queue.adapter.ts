import { randomUUID } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  IWebhookJobQueue,
  WebhookJobEnqueueResult,
  WebhookJobQueueInput,
} from '../application/webhook-job-queue.port';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';

@Injectable()
export class BullMqWebhookJobQueue implements IWebhookJobQueue {
  constructor(
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(input: WebhookJobQueueInput): Promise<WebhookJobEnqueueResult> {
    // Deduplication is what stops a second concurrent reprocess of the same
    // inbox, and it is decided by a single atomic `SET ... NX` inside BullMQ's
    // add script — not by a check-then-add here, which two overlapping requests
    // could both pass before either add ran. #434
    //
    // The deterministic dedup id (`webhook-reprocess-<inboxId>`) is held only
    // while an attempt is in flight and released the moment that attempt
    // completes or fails, so a later reprocess always schedules a fresh attempt.
    // The job id itself is attempt-specific so a finished job — kept in the
    // queue for dead-letter inspection (no removeOnFail) — never occupies the id
    // a subsequent manual reprocess needs. #434
    const jobId = `${input.jobId}-${randomUUID()}`;
    const job = await this.queue.add(
      'process-webhook',
      {
        webhookInboxId: input.webhookInboxId,
        organizationId: input.organizationId,
      },
      {
        jobId,
        deduplication: { id: input.jobId },
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
      },
    );
    // A deduplicated add resolves with the in-flight attempt's id, so the job we
    // get back is ours only when a new attempt was actually scheduled.
    return job?.id === jobId ? 'enqueued' : 'deduped';
  }
}
