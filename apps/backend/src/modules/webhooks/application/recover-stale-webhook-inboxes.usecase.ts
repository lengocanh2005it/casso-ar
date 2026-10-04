import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import type { WebhookInbox } from '../domain/webhook-inbox';
import {
  type IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
} from './webhook-inbox-repository.port';
import {
  type IWebhookJobQueue,
  WEBHOOK_JOB_QUEUE,
} from './webhook-job-queue.port';

/**
 * #421 backstop. The receive path and duplicate-delivery repair already
 * reschedule an inbox whose enqueue failed; this sweep covers the case the
 * provider never redelivers, so a persisted RECEIVED inbox cannot sit with no
 * job forever.
 *
 * The window is comfortably wider than the queue's own retry budget
 * (5 attempts, exponential backoff from 5s, roughly 75s total), so a sweep
 * cannot race a job that is still legitimately retrying.
 */
export const WEBHOOK_INBOX_STALE_AFTER_MS = 5 * 60 * 1000;
export const WEBHOOK_INBOX_SWEEP_LIMIT = 100;

@Injectable()
export class RecoverStaleWebhookInboxesUseCase {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly inboxRepo: IWebhookInboxRepository,
    @Inject(WEBHOOK_JOB_QUEUE)
    private readonly jobQueue: IWebhookJobQueue,
    private readonly tenantContext: TenantContextService,
    private readonly logger: JsonLogger,
  ) {}

  @Cron('*/15 * * * *')
  async recover(now: Date = new Date()): Promise<void> {
    const cutoff = new Date(now.getTime() - WEBHOOK_INBOX_STALE_AFTER_MS);
    const stale = await this.inboxRepo.findStaleReceived(
      cutoff,
      WEBHOOK_INBOX_SWEEP_LIMIT,
    );
    for (const inbox of stale) {
      try {
        await this.jobQueue.enqueue({
          webhookInboxId: inbox.id,
          organizationId: inbox.organizationId,
          jobId: `tx-${inbox.providerTransactionId}`,
        });
      } catch (error) {
        // One unreachable inbox must not abandon the rest of the sweep, and a
        // queue outage has to stay visible. #421
        await this.logFailure(inbox, error);
      }
    }
  }

  private async logFailure(inbox: WebhookInbox, error: unknown): Promise<void> {
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: inbox.organizationId,
        role: Role.OWNER,
      },
      async () => {
        this.logger.error(
          {
            message: 'Stale webhook inbox could not be re-enqueued',
            webhookInboxId: inbox.id,
            organizationId: inbox.organizationId,
            providerTransactionId: inbox.providerTransactionId,
            error: error instanceof Error ? error.message : 'Unknown error',
          },
          error instanceof Error ? error.stack : undefined,
          RecoverStaleWebhookInboxesUseCase.name,
        );
      },
    );
  }
}
