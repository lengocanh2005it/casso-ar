import { Inject, Injectable } from '@nestjs/common';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import { writeAuditLogAsync } from '../../../common/audit/write-audit-log-async';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { WebhookInbox } from '../domain/webhook-inbox';
import { toAuditedWebhookInbox } from './webhook-inbox-audit-view';
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
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly logger: JsonLogger,
  ) {}

  async execute(webhookInboxId: string): Promise<WebhookInbox> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }
    const organizationId = user.organizationId;
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
    const jobId = `webhook-reprocess-${inbox.id}`;
    await this.jobQueue.enqueue({
      webhookInboxId: inbox.id,
      organizationId,
      jobId,
    });

    // Reprocessing only enqueues an async job (the inbox status itself flips
    // later in the worker), so the "resulting state" this log can capture is
    // the enqueue outcome, not the eventual reprocess result.
    const auditedInbox = toAuditedWebhookInbox(inbox);
    writeAuditLogAsync(
      this.auditLogRepo,
      this.logger,
      new AuditLog({
        organizationId: user.organizationId,
        userId: user.userId,
        actionType: AuditActionType.WEBHOOK_REPROCESS,
        entityType: AuditEntityType.WEBHOOK_INBOX,
        entityId: inbox.id,
        beforeState: auditedInbox,
        afterState: { ...auditedInbox, jobId },
        ipAddress: null,
        createdAt: new Date(),
      }),
    );

    return inbox;
  }
}
