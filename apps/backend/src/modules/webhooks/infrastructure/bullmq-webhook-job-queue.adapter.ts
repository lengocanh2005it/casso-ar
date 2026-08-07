import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bullmq';
import type {
  IWebhookJobQueue,
  WebhookJobQueueInput,
} from '../application/webhook-job-queue.port';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';

@Injectable()
export class BullMqWebhookJobQueue implements IWebhookJobQueue {
  constructor(
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  async enqueue(input: WebhookJobQueueInput): Promise<void> {
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
      },
    );
  }
}
