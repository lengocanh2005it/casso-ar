import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type {
  ILedgerEventQuery,
  LedgerEventListFilters,
  LedgerEventListPage,
} from '../application/ledger-event-query.port';
import type { LedgerEvent } from '../domain/ledger-event';
import { LedgerEventOrmEntity } from './ledger-event.orm-entity';

function toDomain(row: LedgerEventOrmEntity): LedgerEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    kind: row.kind,
    amount: Number(row.amount),
    effectiveAt: row.effectiveAt,
    transitionReferenceId: row.transitionReferenceId,
    createdAt: row.createdAt,
  };
}

@Injectable()
export class TypeOrmLedgerEventQuery implements ILedgerEventQuery {
  constructor(
    @InjectRepository(LedgerEventOrmEntity)
    private readonly ormRepo: Repository<LedgerEventOrmEntity>,
  ) {}

  async list(
    organizationId: string,
    filters: LedgerEventListFilters,
    page: number,
    limit: number,
  ): Promise<LedgerEventListPage> {
    const qb = this.ormRepo
      .createQueryBuilder('event')
      .andWhere('event.organizationId = :organizationId', { organizationId })
      .andWhere('event.subjectType = :subjectType', {
        subjectType: filters.subjectType,
      })
      .andWhere('event.subjectId = :subjectId', {
        subjectId: filters.subjectId,
      })
      .orderBy('event.effectiveAt', 'DESC')
      .addOrderBy('event.sequence', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (filters.kind) {
      qb.andWhere('event.kind = :kind', { kind: filters.kind });
    }

    const [rows, total] = await qb.getManyAndCount();
    return { items: rows.map(toDomain), total };
  }
}
