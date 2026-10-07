import {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';
import { buildSeedPlanPaymentHistoryPlans } from './seed-plan-payment-history-dataset';

describe('buildSeedPlanPaymentHistoryPlans', () => {
  const now = new Date('2026-10-07T00:00:00.000Z');

  it('provides a representative second page of local payment history', () => {
    const plans = buildSeedPlanPaymentHistoryPlans(now);

    expect(plans.length).toBeGreaterThan(20);
    expect(new Set(plans.map((plan) => plan.sourceType))).toEqual(
      new Set([
        PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
        PlanPaymentHistorySourceType.PERIOD_CHARGE,
      ]),
    );
    expect(plans.some((plan) => plan.planId === PlanId.STARTER)).toBe(true);
    expect(plans.some((plan) => plan.planId === PlanId.BUSINESS)).toBe(true);
    expect(plans.some((plan) => plan.planId === PlanId.ENTERPRISE)).toBe(true);
    expect(
      plans.some(
        (plan) =>
          plan.initialOutcome === PlanPaymentReceiptOutcome.ACCEPTED &&
          plan.provenance === PlanPaymentHistoryProvenance.PAYOS_WEBHOOK &&
          plan.receivedAmount !== null,
      ),
    ).toBe(true);
    expect(
      plans.some(
        (plan) =>
          plan.initialOutcome === PlanPaymentReceiptOutcome.REVIEW_REQUIRED &&
          plan.provenance === PlanPaymentHistoryProvenance.PAYOS_WEBHOOK &&
          plan.receivedAmount !== null,
      ),
    ).toBe(true);
    expect(
      plans.some(
        (plan) =>
          plan.provenance === PlanPaymentHistoryProvenance.LEGACY_BACKFILL &&
          plan.receivedAmount === null,
      ),
    ).toBe(true);
    expect(
      plans.some(
        (plan) =>
          plan.provenance === PlanPaymentHistoryProvenance.LEGACY_BACKFILL &&
          plan.receivedAmount !== null,
      ),
    ).toBe(true);
    expect(
      plans.some(
        (plan) => BigInt(plan.orderCode) > BigInt(Number.MAX_SAFE_INTEGER),
      ),
    ).toBe(true);
    expect(
      plans.every(
        (plan) =>
          plan.confirmedAt.getTime() <= now.getTime() &&
          (plan.receivedAmount === null ||
            Number.isSafeInteger(plan.receivedAmount)),
      ),
    ).toBe(true);
  });
});
