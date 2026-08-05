import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { Subscription } from './subscription';

describe('Subscription', () => {
  it('creates a FREE subscription for the calendar month containing now', () => {
    const now = new Date('2026-08-15T10:00:00.000Z');
    const subscription = Subscription.createFree('sub-1', 'org-1', now);

    expect(subscription.planId).toBe(PlanId.FREE);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.receivableMonthlyLimit).toBe(50);
    expect(subscription.currentPeriodStart).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(subscription.currentPeriodEnd).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    );
  });

  it('reports the limit reached once usage meets the monthly cap', () => {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-15T00:00:00.000Z'),
    );

    expect(subscription.isReceivableLimitReached(49)).toBe(false);
    expect(subscription.isReceivableLimitReached(50)).toBe(true);
    expect(subscription.isReceivableLimitReached(51)).toBe(true);
  });

  it('rolls to the next calendar month once the current period has expired', () => {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-15T00:00:00.000Z'),
    );

    const rolled = subscription.rollToCurrentPeriodIfExpired(
      new Date('2026-09-02T00:00:00.000Z'),
    );

    expect(rolled).not.toBe(subscription);
    expect(rolled.currentPeriodStart).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(rolled.currentPeriodEnd).toEqual(
      new Date('2026-10-01T00:00:00.000Z'),
    );
  });

  it('keeps the same period when it has not expired yet', () => {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-15T00:00:00.000Z'),
    );

    const result = subscription.rollToCurrentPeriodIfExpired(
      new Date('2026-08-20T00:00:00.000Z'),
    );

    expect(result).toBe(subscription);
  });
});
