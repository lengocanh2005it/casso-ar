import { PlanId, SubscriptionStatus } from '@casso-ledger/shared-types';
import { Subscription } from '../domain/subscription';
import { PlanLimitService } from './plan-limit.service';

describe('PlanLimitService', () => {
  const tenant = { getOrganizationId: () => 'org-1' };
  const manager = {} as any;

  it('lazily creates a FREE subscription when the organization has none', async () => {
    const repo = {
      findByOrganizationIdForUpdate: jest.fn().mockResolvedValue(null),
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
    const subscription = new Subscription({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: PlanId.FREE,
      receivableMonthlyLimit: 5,
      bankConnectionLimit: 1,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      createdAt: new Date('2026-08-01'),
    });
    const repo = {
      findByOrganizationIdForUpdate: jest.fn().mockResolvedValue(subscription),
      countReceivablesInPeriod: jest.fn().mockResolvedValue(5),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await expect(service.enforceReceivableLimit(manager)).rejects.toMatchObject(
      {
        status: 402,
      },
    );
  });

  it('passes when usage is under the monthly cap', async () => {
    const subscription = new Subscription({
      id: 'sub-1',
      organizationId: 'org-1',
      planId: PlanId.FREE,
      receivableMonthlyLimit: 5,
      bankConnectionLimit: 1,
      status: SubscriptionStatus.ACTIVE,
      currentPeriodStart: new Date('2026-08-01'),
      currentPeriodEnd: new Date('2026-09-01'),
      createdAt: new Date('2026-08-01'),
    });
    const repo = {
      findByOrganizationIdForUpdate: jest.fn().mockResolvedValue(subscription),
      countReceivablesInPeriod: jest.fn().mockResolvedValue(4),
      save: jest.fn(),
    };
    const service = new PlanLimitService(repo as any, tenant as any);

    await expect(
      service.enforceReceivableLimit(manager),
    ).resolves.toBeUndefined();
    expect(repo.save).not.toHaveBeenCalled();
  });
});
