import { PeriodChargeStatus } from '@casso-ar/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import type { Subscription } from '../../billing/domain/subscription';
import {
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';
import {
  type IPlanUpgradeOrderRepository,
  PLAN_UPGRADE_ORDER_REPOSITORY,
} from './plan-upgrade-order-repository.port';

@Injectable()
export class PeriodPaymentStatusService {
  constructor(
    @Inject(PERIOD_CHARGE_REPOSITORY)
    private readonly chargeRepo: IPeriodChargeRepository,
    @Inject(PLAN_UPGRADE_ORDER_REPOSITORY)
    private readonly upgradeOrderRepo: IPlanUpgradeOrderRepository,
  ) {}

  // "Has this org paid to keep its current-tier subscription through its
  // current billing period" — a PAID PeriodCharge scoped to this exact period
  // counts, OR a PAID PlanUpgradeOrder that landed inside this period (the
  // period an upgrade lands in is covered by the upgrade payment itself).
  async hasPaidCurrentPeriod(subscription: Subscription): Promise<boolean> {
    const charge = await this.chargeRepo.findLatestByOrganizationAndPeriodStart(
      subscription.organizationId,
      subscription.currentPeriodStart,
    );
    if (charge?.status === PeriodChargeStatus.PAID) return true;

    return this.upgradeOrderRepo.existsPaidWithinRange(
      subscription.organizationId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );
  }
}
