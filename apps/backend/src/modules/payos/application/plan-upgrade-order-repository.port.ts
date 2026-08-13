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
  save(
    order: PlanUpgradeOrder,
    manager?: EntityManager,
    organizationId?: string,
  ): Promise<void>;
  // Used by PeriodPaymentStatusService: a PAID PlanUpgradeOrder that landed
  // inside the current billing period counts as that period's payment (the
  // org doesn't also need a separate PeriodCharge for the period it upgraded in).
  existsPaidWithinRange(
    organizationId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<boolean>;
}

export const PLAN_UPGRADE_ORDER_REPOSITORY = Symbol(
  'PLAN_UPGRADE_ORDER_REPOSITORY',
);
