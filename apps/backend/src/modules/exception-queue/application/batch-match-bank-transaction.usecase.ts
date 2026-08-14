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
import type { BankTransaction } from '../../webhooks/domain/bank-transaction';
import type { MatchAllocationItem } from './match-bank-transaction.usecase';
import { MatchBankTransactionUseCase } from './match-bank-transaction.usecase';

export interface BatchMatchItem {
  bankTransactionId: string;
  allocations: MatchAllocationItem[];
  version: number;
}

@Injectable()
export class BatchMatchBankTransactionUseCase {
  constructor(
    private readonly matchUseCase: MatchBankTransactionUseCase,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly tenantContext: TenantContextService,
    private readonly logger: JsonLogger,
  ) {}

  async execute(
    items: BatchMatchItem[],
  ): Promise<BatchItemResult<BankTransaction>[]> {
    const user = this.tenantContext.getCurrentUser();
    if (!user) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Yêu cầu đăng nhập.');
    }

    return runBatch(
      items,
      (item) => item.bankTransactionId,
      async (item) => {
        const transaction = await this.matchUseCase.execute({
          bankTransactionId: item.bankTransactionId,
          allocations: item.allocations,
          version: item.version,
          allocatedByUserId: user.userId,
        });
        void this.auditLogRepo
          .create(
            new AuditLog({
              organizationId: user.organizationId,
              userId: user.userId,
              actionType: AuditActionType.PAYMENT_ALLOCATE,
              entityType: AuditEntityType.BANK_TRANSACTION,
              entityId: item.bankTransactionId,
              beforeState: null,
              afterState: sanitizeAuditPayload(transaction),
              ipAddress: null,
              createdAt: new Date(),
            }),
          )
          .catch((error: unknown) => {
            this.logger.error({
              message: 'Failed to write batch audit log',
              actionType: AuditActionType.PAYMENT_ALLOCATE,
              entityId: item.bankTransactionId,
              organizationId: user.organizationId,
              userId: user.userId,
              error,
            });
          });
        return transaction;
      },
    );
  }
}
