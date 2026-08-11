import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { Subscription, type SubscriptionProps } from '../domain/subscription';
import { PlanLimitService } from './plan-limit.service';

describe('PlanLimitService', () => {
  const tenant = { getOrganizationId: () => 'org-1' };
  const manager = {} as any;

  function activeSubscription(overrides: Partial<SubscriptionProps> = {}) {
    return new Subscription({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: PlanId.FREE,
      receivableMonthlyLimit: 5,
      bankConnectionLimit: 1,
      copilotChatMonthlyLimit: 5,
      canUseCustomSmtp: false,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      createdAt: new Date('2026-08-01'),
      version: 1,
      ...overrides,
    });
  }

  it('locks and reads the subscription for the caller organization', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(activeSubscription()),
      countReceivablesInPeriod: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await service.enforceReceivableLimit(manager);

    expect(repo.lockAndFindByOrganizationId).toHaveBeenCalledWith(
      'org-1',
      manager,
    );
  });

  it('lazily creates a FREE subscription when the organization has none', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest.fn().mockResolvedValue(null),
      countReceivablesInPeriod: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await service.enforceReceivableLimit(manager);

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PlanId.FREE, organizationId: 'org-1' }),
      manager,
    );
  });

  it('throws a 402 PLAN_LIMIT_EXCEEDED once usage meets the monthly cap', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(activeSubscription()),
      countReceivablesInPeriod: jest.fn().mockResolvedValue(5),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await expect(service.enforceReceivableLimit(manager)).rejects.toMatchObject(
      {
        errorCode: 'PLAN_LIMIT_EXCEEDED',
      },
    );
  });

  it('throws a 402 PLAN_LIMIT_EXCEEDED when the subscription is not ACTIVE', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(
          activeSubscription({ status: SubscriptionStatus.CANCELLED }),
        ),
      countReceivablesInPeriod: jest.fn().mockResolvedValue(0),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await expect(service.enforceReceivableLimit(manager)).rejects.toMatchObject(
      {
        errorCode: 'PLAN_LIMIT_EXCEEDED',
      },
    );
    // A cancelled subscription is blocked before usage is even counted.
    expect(repo.countReceivablesInPeriod).not.toHaveBeenCalled();
  });

  it('passes when usage is under the monthly cap', async () => {
    const repo = {
      lockAndFindByOrganizationId: jest
        .fn()
        .mockResolvedValue(activeSubscription()),
      countReceivablesInPeriod: jest.fn().mockResolvedValue(4),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await expect(
      service.enforceReceivableLimit(manager),
    ).resolves.toBeUndefined();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('enforces the Copilot chat monthly limit inside the billing period', async () => {
    const subscription = activeSubscription();
    const repo = {
      lockAndFindByOrganizationId: jest.fn().mockResolvedValue(subscription),
      countCopilotChatTurnsInPeriod: jest.fn().mockResolvedValue(5),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await expect(
      service.enforceCopilotChatLimit(manager),
    ).rejects.toMatchObject({ errorCode: 'PLAN_LIMIT_EXCEEDED' });
    expect(repo.countCopilotChatTurnsInPeriod).toHaveBeenCalledWith(
      'org-1',
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      manager,
    );
  });
});
