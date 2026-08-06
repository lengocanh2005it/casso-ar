import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import { ProcessWebhookUseCase } from '../application/process-webhook.usecase';
import { WEBHOOK_PROCESSING_QUEUE } from './webhooks-queue.constants';

interface WebhookJobData {
  webhookInboxId: string;
  organizationId: string;
}

@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  constructor(private readonly processWebhook: ProcessWebhookUseCase) {
    super();
  }
  async process(job: Job<WebhookJobData>): Promise<void> {
    await this.processWebhook.execute(
      job.data.webhookInboxId,
      job.data.organizationId,
    );
  }
}
