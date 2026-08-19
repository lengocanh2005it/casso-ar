import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ILedgerEventRepository } from '../application/ledger-event-repository.port';
import type { LedgerEvent } from '../domain/ledger-event';
import { LedgerEventOrmEntity } from './ledger-event.orm-entity';

// Explicit entry → ORM translation: the compiler checks every field, so a
// drift between the two shapes fails here instead of being cast away.
// `sequence` is a DB-generated bigserial and is omitted from inserts.
function toOrm(entry: LedgerEvent): Omit<LedgerEventOrmEntity, 'sequence'> {
  return {
    id: entry.id,
    organizationId: entry.organizationId,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    kind: entry.kind,
    amount: entry.amount,
    effectiveAt: entry.effectiveAt,
    transitionReferenceId: entry.transitionReferenceId,
    createdAt: entry.createdAt,
  };
}

@Injectable()
export class TypeOrmLedgerEventRepository implements ILedgerEventRepository {
  constructor(
    @InjectRepository(LedgerEventOrmEntity)
    private readonly ormRepo: Repository<LedgerEventOrmEntity>,
    private readonly tenantContext: TenantContextService,
  ) {}

  async append(entry: LedgerEvent, manager?: EntityManager): Promise<void> {
    if (entry.organizationId !== this.tenantContext.getOrganizationId()) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Không thể ghi dữ liệu cho tổ chức khác',
      );
    }

    // insert() (not save()) keeps the ledger append-only.
    const row = toOrm(entry);
    if (manager) {
      await manager.getRepository(LedgerEventOrmEntity).insert(row);
      return;
    }
    await this.ormRepo.insert(row);
  }
}
