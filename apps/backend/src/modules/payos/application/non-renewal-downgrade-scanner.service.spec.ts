import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
import { DataSource } from 'typeorm';
import type { IAuditLogRepository } from '../../../common/audit/audit-log-repository.port';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import { NonRenewalDowngradeScannerService } from './non-renewal-downgrade-scanner.service';
import type { PeriodPaymentStatusService } from './period-payment-status.service';

function buildSubscriptionPeriodEndedDaysAgo(days: number): Subscription {
  const periodEnd = new Date(
    new Date('2026-09-04T00:00:00Z').getTime() - days * 24 * 60 * 60 * 1000,
  );
  const periodStart = new Date(periodEnd.getTime() - 31 * 24 * 60 * 60 * 1000);
  return new Subscription({
    id: 'sub-1',
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
    canUseCustomSmtp: false,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    createdAt: periodStart,
    version: 1,
  });
}

describe('NonRenewalDowngradeScannerService', () => {
  function buildDeps(subscription: Subscription, paid: boolean) {
    const subscriptionRepo: jest.Mocked<ISubscriptionRepository> = {
      findAllPaidTierActive: jest.fn().mockResolvedValue([subscription]),
      lockAndFindByOrganizationId: jest.fn().mockResolvedValue(subscription),
      findByOrganizationId: jest.fn(),
      countReceivablesInPeriod: jest.fn(),
      countCopilotChatTurnsInPeriod: jest.fn(),
      save: jest.fn(),
    };
    const paymentStatus = {
      hasPaidCurrentPeriod: jest.fn().mockResolvedValue(paid),
    } as unknown as PeriodPaymentStatusService;
    const auditLogRepo: jest.Mocked<IAuditLogRepository> = {
      create: jest.fn(),
      findPage: jest.fn(),
      deleteOlderThan: jest.fn(),
    };
    const dataSource = {
      transaction: jest.fn((cb: (manager: unknown) => unknown) => cb({})),
    } as unknown as DataSource;

    const service = new NonRenewalDowngradeScannerService(
      subscriptionRepo,
      paymentStatus,
      auditLogRepo,
      dataSource,
    );
    return { service, subscriptionRepo, auditLogRepo };
  }

  it('downgrades to FREE when the grace window has passed and the period is unpaid', async () => {
    const subscription = buildSubscriptionPeriodEndedDaysAgo(3);
    const { service, subscriptionRepo, auditLogRepo } = buildDeps(
      subscription,
      false,
    );

    await service.scan(new Date('2026-09-04T00:00:00Z'));

    expect(subscriptionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ planId: PlanId.FREE }),
      expect.anything(),
      'org-1',
    );
    expect(auditLogRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'system' }),
      expect.anything(),
    );
  });

  it('does nothing while still inside the grace window', async () => {
    const subscription = buildSubscriptionPeriodEndedDaysAgo(1);
    const { service, subscriptionRepo } = buildDeps(subscription, false);

    await service.scan(new Date('2026-09-04T00:00:00Z'));

    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });

  it('does nothing when the period was paid', async () => {
    const subscription = buildSubscriptionPeriodEndedDaysAgo(5);
    const { service, subscriptionRepo } = buildDeps(subscription, true);

    await service.scan(new Date('2026-09-04T00:00:00Z'));

    expect(subscriptionRepo.save).not.toHaveBeenCalled();
  });
});
