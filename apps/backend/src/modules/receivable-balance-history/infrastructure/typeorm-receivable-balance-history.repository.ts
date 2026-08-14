import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IReceivableBalanceHistoryRepository } from '../application/receivable-balance-history.repository.port';
import type { ReceivableBalanceHistoryEntry } from '../domain/receivable-balance-history-entry';
import { ReceivableBalanceHistoryOrmEntity } from './receivable-balance-history.orm-entity';

// Explicit entry → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
// `sequence` is a DB-generated bigserial and is omitted from inserts.
function toOrm(
  entry: ReceivableBalanceHistoryEntry,
): Omit<ReceivableBalanceHistoryOrmEntity, 'sequence'> {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    receivableId: entry.receivableId,
    status: entry.status,
    remainingAmount: entry.remainingAmount,
    effectiveAt: entry.effectiveAt,
    changeSource: entry.changeSource,
    changeReason: entry.changeReason,
    createdAt: entry.createdAt,
  };
}

@Injectable()
export class TypeOrmReceivableBalanceHistoryRepository
  implements IReceivableBalanceHistoryRepository
{
  constructor(
    @InjectRepository(ReceivableBalanceHistoryOrmEntity)
    private readonly ormRepo: Repository<ReceivableBalanceHistoryOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async append(
    entry: ReceivableBalanceHistoryEntry,
    manager?: EntityManager,
  ): Promise<void> {
    if (entry.organizationId !== this.tenantContext.getOrganizationId()) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Không thể ghi dữ liệu cho tổ chức khác',
      );
    }

    // insert() (not save()) keeps the ledger append-only: a duplicate id
    // surfaces the primary-key conflict instead of updating an existing row.
    const row = toOrm(entry);
    if (manager) {
      await manager
        .getRepository(ReceivableBalanceHistoryOrmEntity)
        .insert(row);
      return;
    }
    await this.ormRepo.insert(row);
  }
}
