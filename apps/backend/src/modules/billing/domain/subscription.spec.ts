import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { Subscription } from './subscription';

describe('Subscription', () => {
  it('creates a FREE subscription for the calendar month containing now', () => {
    const now = new Date('2026-08-15T10:00:00.000Z');
    const subscription = Subscription.createFree('sub-1', 'org-1', now);

    expect(subscription.planId).toBe(PlanId.FREE);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.receivableMonthlyLimit).toBe(50);
    expect(subscription.copilotChatMonthlyLimit).toBe(50);
    expect(subscription.currentPeriodStart).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(subscription.currentPeriodEnd).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    );
  });

  it('creates a STARTER subscription with its catalog limits', () => {
    const now = new Date('2026-08-15T10:00:00.000Z');
    const subscription = Subscription.createStarter('sub-1', 'org-1', now);

    expect(subscription.planId).toBe(PlanId.STARTER);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.receivableMonthlyLimit).toBe(500);
    expect(subscription.bankConnectionLimit).toBe(2);
    expect(subscription.copilotChatMonthlyLimit).toBe(100);
    expect(subscription.canUseCustomSmtp).toBe(false);
    expect(subscription.currentPeriodStart).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(subscription.currentPeriodEnd).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(subscription.createdAt).toBe(now);
    expect(subscription.version).toBe(1);
  });

  it('creates a BUSINESS subscription with its catalog limits', () => {
    const now = new Date('2026-08-15T10:00:00.000Z');
    const subscription = Subscription.createBusiness('sub-1', 'org-1', now);

    expect(subscription.planId).toBe(PlanId.BUSINESS);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.receivableMonthlyLimit).toBe(5000);
    expect(subscription.bankConnectionLimit).toBe(5);
    expect(subscription.copilotChatMonthlyLimit).toBe(1000);
    expect(subscription.canUseCustomSmtp).toBe(true);
    expect(subscription.currentPeriodStart).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(subscription.currentPeriodEnd).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(subscription.createdAt).toBe(now);
    expect(subscription.version).toBe(1);
  });

  it('creates an ENTERPRISE subscription with its catalog limits', () => {
    const now = new Date('2026-08-15T10:00:00.000Z');
    const subscription = Subscription.createEnterprise('sub-1', 'org-1', now);

    expect(subscription.planId).toBe(PlanId.ENTERPRISE);
    expect(subscription.status).toBe(SubscriptionStatus.ACTIVE);
    expect(subscription.receivableMonthlyLimit).toBe(15000);
    expect(subscription.bankConnectionLimit).toBe(10);
    expect(subscription.copilotChatMonthlyLimit).toBe(10000);
    expect(subscription.canUseCustomSmtp).toBe(true);
    expect(subscription.currentPeriodStart).toEqual(
      new Date('2026-08-01T00:00:00.000Z'),
    );
    expect(subscription.currentPeriodEnd).toEqual(
      new Date('2026-09-01T00:00:00.000Z'),
    );
    expect(subscription.createdAt).toBe(now);
    expect(subscription.version).toBe(1);
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

  it('reports the Copilot chat limit once usage meets the monthly cap', () => {
    const subscription = Subscription.createFree(
      'sub-1',
      'org-1',
      new Date('2026-08-15T00:00:00.000Z'),
    );

    expect(subscription.isCopilotChatLimitReached(49)).toBe(false);
    expect(subscription.isCopilotChatLimitReached(50)).toBe(true);
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

  describe('changeToPlan', () => {
    it('moves to a strictly higher tier and applies the new plan limits', () => {
      const subscription = Subscription.createFree(
        'sub-1',
        'org-1',
        new Date('2026-08-15T00:00:00.000Z'),
      );

      const upgraded = subscription.changeToPlan(
        PlanId.STARTER,
        new Date('2026-08-16T00:00:00.000Z'),
      );

      expect(upgraded.planId).toBe(PlanId.STARTER);
      expect(upgraded.receivableMonthlyLimit).toBe(500);
      expect(upgraded.bankConnectionLimit).toBe(2);
      expect(upgraded.copilotChatMonthlyLimit).toBe(100);
      expect(upgraded.canUseCustomSmtp).toBe(false);
    });

    it('keeps the current billing period unchanged on an upgrade', () => {
      const subscription = Subscription.createFree(
        'sub-1',
        'org-1',
        new Date('2026-08-15T00:00:00.000Z'),
      );

      const upgraded = subscription.changeToPlan(
        PlanId.BUSINESS,
        new Date('2026-08-16T00:00:00.000Z'),
      );

      expect(upgraded.currentPeriodStart).toEqual(
        subscription.currentPeriodStart,
      );
      expect(upgraded.currentPeriodEnd).toEqual(subscription.currentPeriodEnd);
    });

    it('rejects a same-tier or lower-tier target', () => {
      const subscription = Subscription.createBusiness(
        'sub-1',
        'org-1',
        new Date('2026-08-15T00:00:00.000Z'),
      );

      expect(() =>
        subscription.changeToPlan(
          PlanId.BUSINESS,
          new Date('2026-08-16T00:00:00.000Z'),
        ),
      ).toThrow(
        'Cannot change plan from BUSINESS (tier 2) to BUSINESS (tier 2)',
      );
      expect(() =>
        subscription.changeToPlan(
          PlanId.STARTER,
          new Date('2026-08-16T00:00:00.000Z'),
        ),
      ).toThrow(
        'Cannot change plan from BUSINESS (tier 2) to STARTER (tier 1)',
      );
    });
  });
});
