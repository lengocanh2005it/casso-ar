import { PlanId } from '@casso-ledger/shared-types';

// PayOS checkout amount per plan — distinct from Subscription's PLAN_CATALOG,
// which tracks usage limits, not price.
export const PLAN_PRICE_VND: Record<PlanId, number> = {
  [PlanId.FREE]: 0,
  [PlanId.STARTER]: 299_000,
  [PlanId.BUSINESS]: 999_000,
  [PlanId.ENTERPRISE]: 2_999_000,
};
