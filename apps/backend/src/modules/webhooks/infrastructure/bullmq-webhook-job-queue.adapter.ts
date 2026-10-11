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
    // The deterministic job id is what makes a re-enqueue idempotent, so the id
    // must only be occupied while an attempt is actually in flight. A finished
    // job that lingers (completed or failed) makes BullMQ silently drop every
    // later reprocess of the same inbox — the API reports success while nothing
    // runs. Completed and failed jobs are therefore removed, and an existing
    // job found here is by definition still pending or active. #434
    if (await this.queue.getJob(input.jobId)) {
      return 'deduped';
    }
    await this.queue.add(
      'process-webhook',
      {
        webhookInboxId: input.webhookInboxId,
        organizationId: input.organizationId,
      },
      {
        jobId: input.jobId,
        attempts: 5,
        backoff: { type: 'exponential', delay: 5_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    return 'enqueued';
  }
}
