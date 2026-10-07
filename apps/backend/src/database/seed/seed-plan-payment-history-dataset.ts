import {
  PlanId,
  PlanPaymentHistoryProvenance,
  PlanPaymentHistorySourceType,
  PlanPaymentReceiptOutcome,
} from '@casso-ar/shared-types';

export interface SeedPlanPaymentHistoryPlan {
  sourceType: PlanPaymentHistorySourceType;
  orderCode: string;
  planId: PlanId;
  periodStart: Date | null;
  periodEnd: Date | null;
  receivedAmount: number | null;
  quotedAmount: number | null;
  initialOutcome: PlanPaymentReceiptOutcome;
  provenance: PlanPaymentHistoryProvenance;
  confirmedAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const FIRST_ORDER_CODE = 9_007_199_254_740_993n;
const PLANS = [PlanId.STARTER, PlanId.BUSINESS, PlanId.ENTERPRISE] as const;
const PLAN_PRICES: Record<(typeof PLANS)[number], number> = {
  [PlanId.STARTER]: 299_000,
  [PlanId.BUSINESS]: 999_000,
  [PlanId.ENTERPRISE]: 2_999_000,
};

const CASES = [
  {
    sourceType: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
    initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
    provenance: PlanPaymentHistoryProvenance.PAYOS_WEBHOOK,
    amountOffset: 0,
  },
  {
    sourceType: PlanPaymentHistorySourceType.PERIOD_CHARGE,
    initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
    provenance: PlanPaymentHistoryProvenance.PAYOS_WEBHOOK,
    amountOffset: 0,
  },
  {
    sourceType: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
    initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
    provenance: PlanPaymentHistoryProvenance.PAYOS_WEBHOOK,
    amountOffset: -1_000,
  },
  {
    sourceType: PlanPaymentHistorySourceType.PERIOD_CHARGE,
    initialOutcome: PlanPaymentReceiptOutcome.REVIEW_REQUIRED,
    provenance: PlanPaymentHistoryProvenance.PAYOS_WEBHOOK,
    amountOffset: 1_000,
  },
  {
    sourceType: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
    initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
    provenance: PlanPaymentHistoryProvenance.LEGACY_BACKFILL,
    amountOffset: 0,
  },
  {
    sourceType: PlanPaymentHistorySourceType.PERIOD_CHARGE,
    initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
    provenance: PlanPaymentHistoryProvenance.LEGACY_BACKFILL,
    amountOffset: 0,
  },
  {
    sourceType: PlanPaymentHistorySourceType.PLAN_UPGRADE_ORDER,
    initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
    provenance: PlanPaymentHistoryProvenance.LEGACY_BACKFILL,
    amountOffset: null,
  },
  {
    sourceType: PlanPaymentHistorySourceType.PERIOD_CHARGE,
    initialOutcome: PlanPaymentReceiptOutcome.ACCEPTED,
    provenance: PlanPaymentHistoryProvenance.LEGACY_BACKFILL,
    amountOffset: null,
  },
] as const;

export function buildSeedPlanPaymentHistoryPlans(
  now: Date,
): SeedPlanPaymentHistoryPlan[] {
  return Array.from({ length: 24 }, (_, index) => {
    const paymentCase = CASES[index % CASES.length];
    const planId = PLANS[Math.floor(index / CASES.length) % PLANS.length];
    const confirmedAt = new Date(now.getTime() - (index + 1) * DAY_MS);
    const isPeriodCharge =
      paymentCase.sourceType === PlanPaymentHistorySourceType.PERIOD_CHARGE;
    const amount =
      paymentCase.amountOffset === null
        ? null
        : PLAN_PRICES[planId] + paymentCase.amountOffset;

    return {
      sourceType: paymentCase.sourceType,
      orderCode: (FIRST_ORDER_CODE + BigInt(index)).toString(),
      planId,
      periodStart: isPeriodCharge
        ? new Date(confirmedAt.getTime() - 30 * DAY_MS)
        : null,
      periodEnd: isPeriodCharge
        ? new Date(confirmedAt.getTime() + 30 * DAY_MS)
        : null,
      receivedAmount: amount,
      quotedAmount:
        paymentCase.provenance === PlanPaymentHistoryProvenance.LEGACY_BACKFILL
          ? null
          : PLAN_PRICES[planId],
      initialOutcome: paymentCase.initialOutcome,
      provenance: paymentCase.provenance,
      confirmedAt,
    };
  });
}
