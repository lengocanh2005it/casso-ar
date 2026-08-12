import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { WebhookInbox } from '../domain/webhook-inbox';
import {
  type IWebhookInboxRepository,
  WEBHOOK_INBOX_REPOSITORY,
} from './webhook-inbox-repository.port';
import {
  type IWebhookJobQueue,
  WEBHOOK_JOB_QUEUE,
} from './webhook-job-queue.port';

@Injectable()
export class ReprocessWebhookUseCase {
  constructor(
    @Inject(WEBHOOK_INBOX_REPOSITORY)
    private readonly repo: IWebhookInboxRepository,
    @Inject(WEBHOOK_JOB_QUEUE)
    private readonly jobQueue: IWebhookJobQueue,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(webhookInboxId: string): Promise<WebhookInbox> {
    const organizationId = this.tenantContext.getOrganizationId();
    const inbox = await this.repo.findById(webhookInboxId, organizationId);
    if (!inbox) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy webhook trong hệ thống.',
      );
    }
    if (inbox.status !== 'FAILED') {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Chỉ có thể xử lý lại webhook đang ở trạng thái thất bại.',
      );
    }

    // Deterministic job id makes re-enqueueing idempotent (BullMQ dedupes).
    await this.jobQueue.enqueue({
      webhookInboxId: inbox.id,
      organizationId,
      jobId: `webhook-reprocess-${inbox.id}`,
    });
    return inbox;
  }
}
