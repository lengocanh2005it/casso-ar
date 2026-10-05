import { PlanUpgradeOrderStatus } from '@casso-ar/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, type EntityManager, type Repository } from 'typeorm';
import { BaseRepository } from '../../../common/tenancy/base.repository';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  CreatePlanUpgradeOrderInput,
  IPlanUpgradeOrderRepository,
} from '../application/plan-upgrade-order-repository.port';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import { PlanUpgradeOrderOrmEntity } from './plan-upgrade-order.orm-entity';

// orderCode is bigint in Postgres, which TypeORM maps to string to avoid
// precision loss — this repository is the only place that boundary is crossed.
function toDomainOrderCode(orderCode: string): number {
  return Number(orderCode);
}

function toDomain(row: PlanUpgradeOrderOrmEntity): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: row.id,
    orderCode: toDomainOrderCode(row.orderCode),
    organizationId: row.organizationId,
    targetPlanId: row.targetPlanId,
    quotedAmount: row.quotedAmount,
    payosPaymentLinkId: row.payosPaymentLinkId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toOrm(order: PlanUpgradeOrder): PlanUpgradeOrderOrmEntity {
  return {
    id: order.id,
    orderCode: String(order.orderCode),
    organizationId: order.organizationId,
    targetPlanId: order.targetPlanId,
    quotedAmount: order.quotedAmount,
    payosPaymentLinkId: order.payosPaymentLinkId,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

@Injectable()
export class TypeOrmPlanUpgradeOrderRepository
  extends BaseRepository<PlanUpgradeOrderOrmEntity>
  implements IPlanUpgradeOrderRepository
{
  constructor(
    @InjectRepository(PlanUpgradeOrderOrmEntity)
    repo: Repository<PlanUpgradeOrderOrmEntity>,
    tenantContext: TenantContextService,
  ) {
    super(repo, tenantContext);
  }

  async create(
    input: CreatePlanUpgradeOrderInput,
    manager: EntityManager,
  ): Promise<PlanUpgradeOrder> {
    const now = new Date();
    const saved = await manager.getRepository(PlanUpgradeOrderOrmEntity).save({
      organizationId: input.organizationId,
      targetPlanId: input.targetPlanId,
      quotedAmount: input.quotedAmount,
      payosPaymentLinkId: null,
      status: PlanUpgradeOrderStatus.PENDING,
      createdAt: now,
      updatedAt: now,
    });
    return toDomain(saved);
  }

  async lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PlanUpgradeOrder | null> {
    const row = await manager
      .getRepository(PlanUpgradeOrderOrmEntity)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
      .where('o.orderCode = :orderCode', { orderCode: String(orderCode) })
      .getOne();
    return row ? toDomain(row) : null;
  }

  async lockAndFindByIdAndOrganizationId(
    id: string,
    organizationId: string,
    manager: EntityManager,
  ): Promise<PlanUpgradeOrder | null> {
    const row = await manager
      .getRepository(PlanUpgradeOrderOrmEntity)
      .createQueryBuilder('o')
      .setLock('pessimistic_write')
      .where('o.id = :id', { id })
      .andWhere('o.organizationId = :organizationId', { organizationId })
      .getOne();
    return row ? toDomain(row) : null;
  }

  async save(
    order: PlanUpgradeOrder,
    manager?: EntityManager,
    organizationId?: string,
  ): Promise<void> {
    await this.scopedSaveWithManager(toOrm(order), manager, organizationId);
  }

  async existsPaidWithinRange(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<boolean> {
    const count = await this.ormRepo.count({
      where: {
        organizationId,
        status: PlanUpgradeOrderStatus.PAID,
        updatedAt: Between(periodStart, periodEnd),
      },
    });
    return count > 0;
  }
}
