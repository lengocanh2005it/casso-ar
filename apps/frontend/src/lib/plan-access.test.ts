import { describe, expect, it } from 'vitest';
import { hasPlanAccess } from './plan-access';

describe('hasPlanAccess', () => {
  it('uses the canonical billing plan order', () => {
    expect(hasPlanAccess('STARTER', 'BUSINESS')).toBe(false);
    expect(hasPlanAccess('BUSINESS', 'STARTER')).toBe(true);
    expect(hasPlanAccess('ENTERPRISE', 'BUSINESS')).toBe(true);
  });
});
