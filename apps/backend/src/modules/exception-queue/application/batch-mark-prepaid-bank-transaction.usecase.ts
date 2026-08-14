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
import type { Payment } from '../../payments/domain/payment';
import type { BankTransaction } from '../../webhooks/domain/bank-transaction';
import { MarkPrepaidBankTransactionUseCase } from './mark-prepaid-bank-transaction.usecase';

@Injectable()
export class BatchMarkPrepaidBankTransactionUseCase {
  constructor(
    private readonly markPrepaidUseCase: MarkPrepaidBankTransactionUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
    private readonly logger: JsonLogger,
  ) {}

  async execute(
    bankTransactionIds: string[],
    customerId: string,
  ): Promise<
    BatchItemResult<{ transaction: BankTransaction; payment: Payment }>[]
  > {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(
      bankTransactionIds,
      (id) => id,
      async (bankTransactionId) => {
        const result = await this.markPrepaidUseCase.execute({
          bankTransactionId,
          customerId,
        });
        void this.auditLogRepo
          .create(
            new AuditLog({
              organizationId: user.organizationId,
              userId: user.userId,
              actionType: AuditActionType.BANK_TRANSACTION_MARK_PREPAID,
              entityType: AuditEntityType.BANK_TRANSACTION,
              entityId: bankTransactionId,
              beforeState: null,
              afterState: sanitizeAuditPayload(result),
              ipAddress: null,
              createdAt: new Date(),
            }),
          )
          .catch((error: unknown) => {
            this.logger.error({
              message: 'Failed to write batch audit log',
              actionType: AuditActionType.BANK_TRANSACTION_MARK_PREPAID,
              entityId: bankTransactionId,
              organizationId: user.organizationId,
              userId: user.userId,
              error,
            });
          });
        return result;
      },
    );
  }
}
