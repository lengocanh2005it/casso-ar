import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { ProcessWebhookUseCase } from '../application/process-webhook.usecase';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';

interface WebhookJobData {
  webhookInboxId: string;
  organizationId: string;
}

@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private readonly processWebhook: ProcessWebhookUseCase) {
    super();
  }
  async process(job: Job<WebhookJobData>): Promise<void> {
    await this.processWebhook.execute(
      job.data.webhookInboxId,
      job.data.organizationId,
    );
  }

  // Spec §4.3: after the retry budget is exhausted, the job moves to the
  // Dead Letter Queue. WebhookInbox is already left in FAILED status by
  // ProcessWebhookUseCase on every attempt (with retryCount incremented) —
  // this only logs the terminal transition, same convention as
  // EmailQueueProcessor.onFailed.
  @OnWorkerEvent('failed')
  onFailed(job: Job<WebhookJobData> | undefined): void {
    if (!job) return;
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade < maxAttempts) return;
    this.logger.error(
      `Webhook job ${job.id ?? 'unknown'} moved to dead letter after ${job.attemptsMade} attempts (webhookInboxId=${job.data.webhookInboxId})`,
    );
  }
}
