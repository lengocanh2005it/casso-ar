import { PlanId } from '@casso-ar/shared-types';
import { describe, expect, it } from 'vitest';
import { hasPlanAccess } from './plan-access';

describe('hasPlanAccess', () => {
  it('uses the canonical billing plan order', () => {
    expect(hasPlanAccess(PlanId.STARTER, PlanId.BUSINESS)).toBe(false);
    expect(hasPlanAccess(PlanId.BUSINESS, PlanId.STARTER)).toBe(true);
    expect(hasPlanAccess(PlanId.ENTERPRISE, PlanId.BUSINESS)).toBe(true);
  });
});
