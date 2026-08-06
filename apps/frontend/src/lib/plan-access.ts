import { PlanId } from '@casso-ledger/shared-types';

const PLAN_HIERARCHY: Record<PlanId, number> = {
  [PlanId.FREE]: 0,
  [PlanId.STARTER]: 1,
  [PlanId.BUSINESS]: 2,
  [PlanId.ENTERPRISE]: 3,
};

export function hasPlanAccess(
  currentPlan: PlanId,
  requiredPlan: PlanId,
): boolean {
  return PLAN_HIERARCHY[currentPlan] >= PLAN_HIERARCHY[requiredPlan];
}
