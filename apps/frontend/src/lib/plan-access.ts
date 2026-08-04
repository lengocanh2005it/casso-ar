type Plan = 'FREE' | 'STARTER' | 'GROWTH' | 'SCALE';

const PLAN_HIERARCHY: Record<Plan, number> = {
  FREE: 0,
  STARTER: 1,
  GROWTH: 2,
  SCALE: 3,
};

export function hasPlanAccess(currentPlan: Plan, requiredPlan: Plan): boolean {
  return PLAN_HIERARCHY[currentPlan] >= PLAN_HIERARCHY[requiredPlan];
}
