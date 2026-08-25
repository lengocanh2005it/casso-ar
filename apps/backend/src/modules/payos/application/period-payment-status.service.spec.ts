import { PeriodChargeStatus, PlanId } from '@casso-ar/shared-types';
import { Subscription } from '../../billing/domain/subscription';
import { PeriodCharge } from '../domain/period-charge';
import type { IPeriodChargeRepository } from './period-charge-repository.port';
import { PeriodPaymentStatusService } from './period-payment-status.service';
import type { IPlanUpgradeOrderRepository } from './plan-upgrade-order-repository.port';

function buildSubscription(): Subscription {
  return Subscription.createStarter(
    'sub-1',
    'org-1',
    new Date('2026-08-01T00:00:00Z'),
  );
}

describe('PeriodPaymentStatusService', () => {
  function buildDeps() {
    const chargeRepo: jest.Mocked<IPeriodChargeRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn(),
      save: jest.fn(),
      findLatestByOrganizationAndPeriodStart: jest.fn(),
    };
    const upgradeOrderRepo: jest.Mocked<IPlanUpgradeOrderRepository> = {
      create: jest.fn(),
      lockAndFindByOrderCode: jest.fn(),
      save: jest.fn(),
      existsPaidWithinRange: jest.fn(),
    };
    const service = new PeriodPaymentStatusService(
      chargeRepo,
      upgradeOrderRepo,
    );
    return { service, chargeRepo, upgradeOrderRepo };
  }

  it('returns true when a PAID PeriodCharge exists for the current period', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(
      new PeriodCharge({
        id: 'c1',
        orderCode: 100_000_001,
        organizationId: 'org-1',
        planId: PlanId.STARTER,
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-09-01T00:00:00Z'),
        status: PeriodChargeStatus.PAID,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );

    const result = await service.hasPaidCurrentPeriod(buildSubscription());
    expect(result).toBe(true);
    expect(upgradeOrderRepo.existsPaidWithinRange).not.toHaveBeenCalled();
  });

  it('falls back to checking a PAID PlanUpgradeOrder within the period when no PeriodCharge exists', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(null);
    upgradeOrderRepo.existsPaidWithinRange.mockResolvedValue(true);

    const subscription = buildSubscription();
    const result = await service.hasPaidCurrentPeriod(subscription);

    expect(result).toBe(true);
    expect(upgradeOrderRepo.existsPaidWithinRange).toHaveBeenCalledWith(
      'org-1',
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
    );
  });

  it('returns false when neither a PAID PeriodCharge nor a PAID PlanUpgradeOrder covers the period', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(null);
    upgradeOrderRepo.existsPaidWithinRange.mockResolvedValue(false);

    const result = await service.hasPaidCurrentPeriod(buildSubscription());
    expect(result).toBe(false);
  });

  it('returns false when the latest PeriodCharge for the period is still PENDING/FAILED', async () => {
    const { service, chargeRepo, upgradeOrderRepo } = buildDeps();
    chargeRepo.findLatestByOrganizationAndPeriodStart.mockResolvedValue(
      new PeriodCharge({
        id: 'c1',
        orderCode: 100_000_001,
        organizationId: 'org-1',
        planId: PlanId.STARTER,
        periodStart: new Date('2026-08-01T00:00:00Z'),
        periodEnd: new Date('2026-09-01T00:00:00Z'),
        status: PeriodChargeStatus.FAILED,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    upgradeOrderRepo.existsPaidWithinRange.mockResolvedValue(false);

    const result = await service.hasPaidCurrentPeriod(buildSubscription());
    expect(result).toBe(false);
  });
});
