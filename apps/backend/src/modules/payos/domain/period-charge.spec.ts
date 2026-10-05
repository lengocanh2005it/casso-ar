import { PeriodChargeStatus, PlanId } from '@casso-ar/shared-types';
import { PeriodCharge } from './period-charge';

function buildCharge(status = PeriodChargeStatus.PENDING): PeriodCharge {
  return new PeriodCharge({
    id: 'charge-1',
    orderCode: 100_000_001,
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    periodStart: new Date('2026-09-01T00:00:00Z'),
    periodEnd: new Date('2026-10-01T00:00:00Z'),
    quotedAmount: 299000,
    payosPaymentLinkId: null,
    status,
    createdAt: new Date('2026-08-28T00:00:00Z'),
    updatedAt: new Date('2026-08-28T00:00:00Z'),
  });
}

describe('PeriodCharge', () => {
  it('markPaid() transitions PENDING to PAID', () => {
    const charge = buildCharge();
    const paid = charge.markPaid();
    expect(paid.status).toBe(PeriodChargeStatus.PAID);
    expect(paid.orderCode).toBe(charge.orderCode);
  });

  it('markFailed() transitions PENDING to FAILED', () => {
    const charge = buildCharge();
    const failed = charge.markFailed();
    expect(failed.status).toBe(PeriodChargeStatus.FAILED);
  });

  it('isTerminal() is false for PENDING, true for PAID/FAILED', () => {
    expect(buildCharge(PeriodChargeStatus.PENDING).isTerminal()).toBe(false);
    expect(buildCharge(PeriodChargeStatus.PAID).isTerminal()).toBe(true);
    expect(buildCharge(PeriodChargeStatus.FAILED).isTerminal()).toBe(true);
  });

  it('has a terminal REVIEW_REQUIRED status for received money without renewal', () => {
    expect(Object.values(PeriodChargeStatus)).toContain('REVIEW_REQUIRED');
  });
});
