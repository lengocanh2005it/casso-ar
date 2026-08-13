import { PERIOD_CHARGE_ORDER_CODE_OFFSET } from './typeorm-period-charge.repository';

describe('PERIOD_CHARGE_ORDER_CODE_OFFSET', () => {
  it('is large enough that PlanUpgradeOrder and PeriodCharge orderCode spaces cannot overlap for realistic order volume', () => {
    expect(PERIOD_CHARGE_ORDER_CODE_OFFSET).toBe(100_000_000);
  });
});
