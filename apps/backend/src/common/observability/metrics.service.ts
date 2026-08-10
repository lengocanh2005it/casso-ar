import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { Counter, Gauge, Histogram, Registry } from 'prom-client';
import { EMAIL_QUEUE } from '../../modules/notifications/infrastructure/email-queue.constants';
import { WEBHOOK_PROCESSING_QUEUE } from '../../modules/webhooks/infrastructure/webhooks-queue.constants';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly registry = new Registry();

  private readonly httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration in seconds, by method/route/status_code',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [this.registry],
  });

  private readonly webhookProcessingDuration = new Histogram({
    name: 'webhook_processing_duration_seconds',
    help: 'Duration of processing a single webhook job end-to-end',
    buckets: [0.05, 0.1, 0.3, 0.5, 1, 2, 5, 10],
    registers: [this.registry],
  });

  private readonly bullmqJobFailedTotal = new Counter({
    name: 'bullmq_job_failed_total',
    help: 'Total number of BullMQ jobs that failed, by queue name',
    labelNames: ['queue'],
    registers: [this.registry],
  });

  private bullmqQueueBacklogSize!: Gauge<'queue'>;

  constructor(
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE)
    private readonly webhookQueue: Queue,
    @InjectQueue(EMAIL_QUEUE)
    private readonly emailQueue: Queue,
  ) {}

  onModuleInit(): void {
    this.bullmqQueueBacklogSize = new Gauge({
      name: 'bullmq_queue_backlog_size',
      help: 'Current waiting + active job count, by queue name',
      labelNames: ['queue'],
      collect: async () => {
        const [webhookWaiting, webhookActive, emailWaiting, emailActive] =
          await Promise.all([
            this.webhookQueue.getWaitingCount(),
            this.webhookQueue.getActiveCount(),
            this.emailQueue.getWaitingCount(),
            this.emailQueue.getActiveCount(),
          ]);

        this.bullmqQueueBacklogSize.set(
          { queue: WEBHOOK_PROCESSING_QUEUE },
          webhookWaiting + webhookActive,
        );
        this.bullmqQueueBacklogSize.set(
          { queue: EMAIL_QUEUE },
          emailWaiting + emailActive,
        );
      },
      registers: [this.registry],
    });
  }

  observeHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    seconds: number,
  ): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: String(statusCode) },
      seconds,
    );
  }

  observeWebhookProcessing(seconds: number): void {
    this.webhookProcessingDuration.observe(seconds);
  }

  incrementBullmqJobFailed(queue: string): void {
    this.bullmqJobFailedTotal.inc({ queue });
  }

  async getMetricsText(): Promise<string> {
    return this.registry.metrics();
  }
}
