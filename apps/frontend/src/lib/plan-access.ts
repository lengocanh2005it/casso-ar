export type Plan = 'FREE' | 'STARTER' | 'BUSINESS' | 'ENTERPRISE';

const PLAN_HIERARCHY: Record<Plan, number> = {
  FREE: 0,
  STARTER: 1,
  BUSINESS: 2,
  ENTERPRISE: 3,
};

export function hasPlanAccess(currentPlan: Plan, requiredPlan: Plan): boolean {
  return PLAN_HIERARCHY[currentPlan] >= PLAN_HIERARCHY[requiredPlan];
}
