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
import { sanitizeAuditPayload } from '../../../common/audit/sanitize-audit-payload';
import {
  type BatchItemResult,
  runBatch,
} from '../../../common/batch/run-batch';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { JsonLogger } from '../../../common/observability/json-logger.service';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { Receivable } from '../domain/receivable';
import { CancelReceivableUseCase } from './cancel-receivable.usecase';

@Injectable()
export class BatchCancelReceivableUseCase {
  constructor(
    private readonly cancelUseCase: CancelReceivableUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
    private readonly logger: JsonLogger,
  ) {}

  async execute(ids: string[]): Promise<BatchItemResult<Receivable>[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(
      ids,
      (id) => id,
      async (id) => {
        const receivable = await this.cancelUseCase.execute(id);
        void this.auditLogRepo
          .create(
            new AuditLog({
              organizationId: user.organizationId,
              userId: user.userId,
              actionType: AuditActionType.RECEIVABLE_CANCEL,
              entityType: AuditEntityType.RECEIVABLE,
              entityId: id,
              relatedReceivableId: id,
              beforeState: null,
              afterState: sanitizeAuditPayload(receivable),
              ipAddress: null,
              createdAt: new Date(),
            }),
          )
          .catch((error: unknown) => {
            this.logger.error({
              message: 'Failed to write batch audit log',
              actionType: AuditActionType.RECEIVABLE_CANCEL,
              entityId: id,
              organizationId: user.organizationId,
              userId: user.userId,
              error,
            });
          });
        return receivable;
      },
    );
  }
}
