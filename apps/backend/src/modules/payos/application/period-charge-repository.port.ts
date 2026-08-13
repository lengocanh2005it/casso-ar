import type { PlanId } from '@casso-ledger/shared-types';
import type { EntityManager } from 'typeorm';
import type { PeriodCharge } from '../domain/period-charge';

export interface CreatePeriodChargeInput {
  organizationId: string;
  planId: PlanId;
  periodStart: Date;
  periodEnd: Date;
}

export interface IPeriodChargeRepository {
  create(input: CreatePeriodChargeInput): Promise<PeriodCharge>;
  lockAndFindByOrderCode(
    orderCode: number,
    manager: EntityManager,
  ): Promise<PeriodCharge | null>;
  save(
    charge: PeriodCharge,
    manager?: EntityManager,
    organizationId?: string,
  ): Promise<void>;
  // Used by PeriodPaymentStatusService (Task 12) to check "has this org paid
  // for its current period yet" — returns the most recent attempt (PENDING,
  // FAILED, or PAID) regardless of outcome; the caller checks .status.
  findLatestByOrganizationAndPeriodStart(
    organizationId: string,
    periodStart: Date,
  ): Promise<PeriodCharge | null>;
}

export const PERIOD_CHARGE_REPOSITORY = Symbol('PERIOD_CHARGE_REPOSITORY');
