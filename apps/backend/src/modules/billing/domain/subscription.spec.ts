import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
import { getPlanCatalog, Subscription } from './subscription';

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

      const upgraded = subscription.changeToPlan(PlanId.STARTER);

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

      const upgraded = subscription.changeToPlan(PlanId.BUSINESS);

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

      expect(() => subscription.changeToPlan(PlanId.BUSINESS)).toThrow(
        'Cannot change plan from BUSINESS (tier 2) to BUSINESS (tier 2)',
      );
      expect(() => subscription.changeToPlan(PlanId.STARTER)).toThrow(
        'Cannot change plan from BUSINESS (tier 2) to STARTER (tier 1)',
      );
    });
  });

  describe('revertToFreeForNonRenewal', () => {
    it('moves a paid-tier subscription to FREE regardless of tier direction', () => {
      const subscription = Subscription.createBusiness(
        'sub-1',
        'org-1',
        new Date('2026-08-01T00:00:00Z'),
      );
      const reverted = subscription.revertToFreeForNonRenewal(
        new Date('2026-09-04T00:00:00Z'),
      );
      expect(reverted.planId).toBe(PlanId.FREE);
      expect(reverted.receivableMonthlyLimit).toBe(50);
      expect(reverted.bankConnectionLimit).toBe(1);
      expect(reverted.copilotChatMonthlyLimit).toBe(50);
      expect(reverted.canUseCustomSmtp).toBe(false);
    });

    it('is a no-op tier check bypass — does not throw even though FREE is a lower tier', () => {
      const subscription = Subscription.createStarter(
        'sub-1',
        'org-1',
        new Date('2026-08-01T00:00:00Z'),
      );
      expect(() =>
        subscription.revertToFreeForNonRenewal(
          new Date('2026-09-04T00:00:00Z'),
        ),
      ).not.toThrow();
    });

    it('rolls the billing period to the calendar month containing now, instead of leaving the ended paid period in place', () => {
      const subscription = Subscription.createStarter(
        'sub-1',
        'org-1',
        new Date('2026-08-01T00:00:00Z'),
      );
      const reverted = subscription.revertToFreeForNonRenewal(
        new Date('2026-09-04T00:00:00Z'),
      );
      expect(reverted.currentPeriodStart).toEqual(
        new Date('2026-09-01T00:00:00.000Z'),
      );
      expect(reverted.currentPeriodEnd).toEqual(
        new Date('2026-10-01T00:00:00.000Z'),
      );
    });

    it('leaves status ACTIVE — non-renewal downgrade must never produce a PAST_DUE/blocked subscription', () => {
      const subscription = Subscription.createStarter(
        'sub-1',
        'org-1',
        new Date('2026-08-01T00:00:00Z'),
      );
      const reverted = subscription.revertToFreeForNonRenewal(
        new Date('2026-09-04T00:00:00Z'),
      );
      expect(reverted.status).toBe(SubscriptionStatus.ACTIVE);
    });
  });
});

describe('getPlanCatalog', () => {
  it('returns all four plans with their price and usage limits', () => {
    const catalog = getPlanCatalog();

    expect(catalog).toEqual([
      {
        planId: PlanId.FREE,
        priceVnd: 0,
        receivableMonthlyLimit: 50,
        bankConnectionLimit: 1,
        copilotChatMonthlyLimit: 50,
      },
      {
        planId: PlanId.STARTER,
        priceVnd: 299_000,
        receivableMonthlyLimit: 500,
        bankConnectionLimit: 2,
        copilotChatMonthlyLimit: 100,
      },
      {
        planId: PlanId.BUSINESS,
        priceVnd: 999_000,
        receivableMonthlyLimit: 5000,
        bankConnectionLimit: 5,
        copilotChatMonthlyLimit: 1000,
      },
      {
        planId: PlanId.ENTERPRISE,
        priceVnd: 2_999_000,
        receivableMonthlyLimit: 15000,
        bankConnectionLimit: 10,
        copilotChatMonthlyLimit: 10000,
      },
    ]);
  });
});
