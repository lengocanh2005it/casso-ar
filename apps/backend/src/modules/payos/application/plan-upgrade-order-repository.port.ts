import type { PlanId } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import type { PlanUpgradeOrder } from '../domain/plan-upgrade-order';

export interface CreatePlanUpgradeOrderInput {
  organizationId: string;
  targetPlanId: PlanId;
}

export interface IPlanUpgradeOrderRepository {
  create(input: CreatePlanUpgradeOrderInput): Promise<PlanUpgradeOrder>;
  lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PlanUpgradeOrder | null>;
  save(order: PlanUpgradeOrder, manager?: EntityManager): Promise<void>;
}

export const PLAN_UPGRADE_ORDER_REPOSITORY = Symbol(
  'PLAN_UPGRADE_ORDER_REPOSITORY',
);
