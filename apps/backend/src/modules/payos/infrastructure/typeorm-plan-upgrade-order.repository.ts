import { PlanUpgradeOrderStatus } from '@casso-ledger/shared-types';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type {
  CreatePlanUpgradeOrderInput,
  IPlanUpgradeOrderRepository,
} from '../application/plan-upgrade-order-repository.port';
import { PlanUpgradeOrder } from '../domain/plan-upgrade-order';
import { PlanUpgradeOrderOrmEntity } from './plan-upgrade-order.orm-entity';

function toDomain(row: PlanUpgradeOrderOrmEntity): PlanUpgradeOrder {
  return new PlanUpgradeOrder({
    id: row.id,
    orderCode: Number(row.orderCode),
    organizationId: row.organizationId,
    targetPlanId: row.targetPlanId,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

function toOrm(
  order: PlanUpgradeOrder,
): Omit<PlanUpgradeOrderOrmEntity, 'orderCode'> & { orderCode: string } {
  return {
    id: order.id,
    orderCode: String(order.orderCode),
    organizationId: order.organizationId,
    targetPlanId: order.targetPlanId,
    status: order.status,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

@Injectable()
export class TypeOrmPlanUpgradeOrderRepository
  implements IPlanUpgradeOrderRepository
{
  constructor(
    @InjectRepository(PlanUpgradeOrderOrmEntity)
    private readonly ormRepo: Repository<PlanUpgradeOrderOrmEntity>,
  ) {}

  async create(input: CreatePlanUpgradeOrderInput): Promise<PlanUpgradeOrder> {
    const now = new Date();
    const saved = await this.ormRepo.save({
      organizationId: input.organizationId,
      targetPlanId: input.targetPlanId,
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

  async save(order: PlanUpgradeOrder, manager?: EntityManager): Promise<void> {
    const repo = manager
      ? manager.getRepository(PlanUpgradeOrderOrmEntity)
      : this.ormRepo;
    await repo.save(toOrm(order));
  }
}
