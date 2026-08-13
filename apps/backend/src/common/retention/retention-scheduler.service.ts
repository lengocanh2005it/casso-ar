import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { IAlertRepository } from '../../modules/alerts/application/alert-repository.port';
import { ALERT_REPOSITORY } from '../../modules/alerts/application/alert-repository.port';
import type { ICollectionActivityRepository } from '../../modules/collection-activity/application/collection-activity-repository.port';
import { COLLECTION_ACTIVITY_REPOSITORY } from '../../modules/collection-activity/application/collection-activity-repository.port';
import type { IAIUsageLogRepository } from '../../modules/copilot/application/ai-usage-log-repository.port';
import { AI_USAGE_LOG_REPOSITORY } from '../../modules/copilot/application/ai-usage-log-repository.port';
import type { IReminderExecutionRepository } from '../../modules/reminders/application/reminder-execution-repository.port';
import type { IWebhookInboxRepository } from '../../modules/webhooks/application/webhook-inbox-repository.port';
import { WEBHOOK_INBOX_REPOSITORY } from '../../modules/webhooks/application/webhook-inbox-repository.port';
import type { IAuditLogRepository } from '../audit/audit-log-repository.port';
import { AUDIT_LOG_REPOSITORY } from '../audit/audit-log-repository.port';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { REMINDER_EXECUTION_REPOSITORY } from '../tokens/reminder-execution.token';

export const RETENTION_TIMEZONE = 'Asia/Ho_Chi_Minh';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * DAY_MS);
}

@Injectable()
export class RetentionSchedulerService {
  private readonly logger = new Logger(RetentionSchedulerService.name);

  constructor(
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    @Inject(AI_USAGE_LOG_REPOSITORY)
    private readonly aiUsageLogRepo: IAIUsageLogRepository,
    @Inject(COLLECTION_ACTIVITY_REPOSITORY)
    private readonly collectionActivityRepo: ICollectionActivityRepository,
    @Inject(REMINDER_EXECUTION_REPOSITORY)
    private readonly reminderExecutionRepo: IReminderExecutionRepository,
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly webhookInboxRepo: IWebhookInboxRepository,
    @Inject(ALERT_REPOSITORY)
    private readonly alertRepo: IAlertRepository,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  @Cron('0 3 * * *', { timeZone: RETENTION_TIMEZONE })
  async prune(): Promise<void> {
    await this.sweep('audit_logs', () =>
      this.auditLogRepo.deleteOlderThan(daysAgo(730)),
    );
    await this.sweep('ai_usage_logs', () =>
      this.aiUsageLogRepo.deleteOlderThan(daysAgo(365)),
    );
    await this.sweep('collection_activities', () =>
      this.collectionActivityRepo.deleteOlderThan(daysAgo(730)),
    );
    await this.sweep('reminder_executions', () =>
      this.reminderExecutionRepo.deleteOlderThan(daysAgo(730)),
    );
    await this.sweep('webhook_inbox', () =>
      this.webhookInboxRepo.deleteOlderThan(daysAgo(90)),
    );
    await this.sweep('idempotency_keys(completed)', () =>
      this.idempotencyService.deleteCompletedOlderThan(daysAgo(90)),
    );
    await this.sweep('idempotency_keys(stale_pending)', () =>
      this.idempotencyService.sweepStalePending(),
    );
    await this.sweep('alerts(read)', () =>
      this.alertRepo.deleteReadOlderThan(daysAgo(90)),
    );
  }

  private async sweep(
    table: string,
    run: () => Promise<number>,
  ): Promise<void> {
    try {
      const deleted = await run();
      this.logger.log({ message: 'Retention sweep completed', table, deleted });
    } catch (error) {
      this.logger.error({
        message: 'Retention sweep failed',
        table,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
