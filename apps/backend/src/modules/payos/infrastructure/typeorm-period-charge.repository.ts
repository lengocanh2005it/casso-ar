import { PeriodChargeStatus } from '@casso-ledger/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CreatePeriodChargeInput,
  IPeriodChargeRepository,
} from '../application/period-charge-repository.port';
import { PeriodCharge } from '../domain/period-charge';
import { PeriodChargeOrmEntity } from './period-charge.orm-entity';

// PlanUpgradeOrder and PeriodCharge each auto-increment their own orderCode
// from 1 in their own table — left alone, both would produce orderCode=1,2,3…
// independently, and a PayOS webhook (a bare orderCode number, no table
// discriminator) would be ambiguous between the two. Offsetting PeriodCharge's
// DOMAIN-level orderCode by a large constant makes the two spaces disjoint
// without touching the schema or needing a shared Postgres sequence — see
// docs/superpowers/plans/2026-08-13-renewal-and-non-renewal-downgrade.md.
export const PERIOD_CHARGE_ORDER_CODE_OFFSET = 100_000_000;

function toDomainOrderCode(rawOrderCode: string): number {
  return Number(rawOrderCode) + PERIOD_CHARGE_ORDER_CODE_OFFSET;
}

function toRawOrderCode(domainOrderCode: number): number {
  return domainOrderCode - PERIOD_CHARGE_ORDER_CODE_OFFSET;
}

function toDomain(row: PeriodChargeOrmEntity): PeriodCharge {
  return new PeriodCharge({
    id: row.id,
    orderCode: toDomainOrderCode(row.orderCode),
    organizationId: row.organizationId,
    planId: row.planId,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toOrm(charge: PeriodCharge): PeriodChargeOrmEntity {
  return {
    id: charge.id,
    orderCode: String(toRawOrderCode(charge.orderCode)),
    organizationId: charge.organizationId,
    planId: charge.planId,
    periodStart: charge.periodStart,
    periodEnd: charge.periodEnd,
    status: charge.status,
    createdAt: charge.createdAt,
    updatedAt: charge.updatedAt,
  };
}

@Injectable()
export class TypeOrmPeriodChargeRepository
  extends BaseRepository<PeriodChargeOrmEntity>
  implements IPeriodChargeRepository
{
  constructor(
    @InjectRepository(PeriodChargeOrmEntity)
    repo: Repository<PeriodChargeOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async create(input: CreatePeriodChargeInput): Promise<PeriodCharge> {
    const now = new Date();
    const saved = await this.ormRepo.save({
      organizationId: input.organizationId,
      planId: input.planId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      status: PeriodChargeStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });
    return toDomain(saved);
  }

  async lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PeriodCharge | null> {
    const raw = toRawOrderCode(orderCode);
    if (raw <= 0) return null;
    const row = await manager
      .getRepository(PeriodChargeOrmEntity)
      .createQueryBuilder('c')
      .setLock('pessimistic_write')
      .where('c.orderCode = :orderCode', { orderCode: String(raw) })
      .getOne();
    return row ? toDomain(row) : null;
  }

  async save(
    charge: PeriodCharge,
    manager?: EntityManager,
    organizationId?: string,
  ): Promise<void> {
    await this.scopedSaveWithManager(toOrm(charge), manager, organizationId);
  }

  async findLatestByOrganizationAndPeriodStart(
    organizationId: string,
    periodStart: Date,
  ): Promise<PeriodCharge | null> {
    const row = await this.ormRepo.findOne({
      where: { organizationId, periodStart },
      order: { createdAt: 'DESC' },
    });
    return row ? toDomain(row) : null;
  }
}
