import { PlanId, SubscriptionStatus } from '@casso-ar/shared-types';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { Subscription } from '../../billing/domain/subscription';
import type { IEmailQueue } from '../../notifications/application/email-queue.port';
import type { IMembershipRepository } from '../../organizations/application/membership-repository.port';
import type { IUserRepository } from '../../users/application/user-repository.port';
import type { InitiatePeriodChargeUseCase } from './initiate-period-charge.usecase';
import type { PeriodPaymentStatusService } from './period-payment-status.service';
import { RenewalReminderScannerService } from './renewal-reminder-scanner.service';

function buildSubscriptionEndingIn(days: number): Subscription {
  const now = new Date('2026-08-28T00:00:00Z');
  const periodEnd = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return new Subscription({
    id: 'sub-1',
    organizationId: 'org-1',
    planId: PlanId.STARTER,
    receivableMonthlyLimit: 500,
    bankConnectionLimit: 2,
    copilotChatMonthlyLimit: 100,
    canUseCustomSmtp: false,
    status: SubscriptionStatus.ACTIVE,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    createdAt: now,
    version: 1,
  });
}

describe('RenewalReminderScannerService', () => {
  function buildDeps(subscription: Subscription) {
    const subscriptionRepo: jest.Mocked<ISubscriptionRepository> = {
      findAllPaidTierActive: jest.fn().mockResolvedValue([subscription]),
      findByOrganizationId: jest.fn(),
      lockAndFindByOrganizationId: jest.fn(),
      countReceivablesInPeriod: jest.fn(),
      countCopilotChatTurnsInPeriod: jest.fn(),
      save: jest.fn(),
    };
    const paymentStatus = {
      hasPaidCurrentPeriod: jest.fn().mockResolvedValue(false),
    } as unknown as PeriodPaymentStatusService;
    const initiateCharge = {
      execute: jest.fn().mockResolvedValue({
        checkoutUrl: 'https://pay.payos.vn/x',
      }),
    } as unknown as InitiatePeriodChargeUseCase;
    const membershipRepo: jest.Mocked<IMembershipRepository> = {
      findOwnerByOrganization: jest.fn().mockResolvedValue({
        userId: 'user-1',
      }),
    } as never;
    const userRepo: jest.Mocked<IUserRepository> = {
      findById: jest.fn().mockResolvedValue({ email: 'owner@example.com' }),
    } as never;
    const emailQueue: jest.Mocked<IEmailQueue> = {
      add: jest.fn(),
    } as never;
    const tenantContext = {
      run: jest.fn((_user, fn) => fn()),
    } as unknown as TenantContextService;

    const service = new RenewalReminderScannerService(
      subscriptionRepo,
      paymentStatus,
      initiateCharge,
      membershipRepo,
      userRepo,
      emailQueue,
      tenantContext,
    );
    return { service, initiateCharge, emailQueue, paymentStatus };
  }

  it('sends a reminder + creates a PeriodCharge exactly 3 days before period end when unpaid', async () => {
    const subscription = buildSubscriptionEndingIn(3);
    const { service, initiateCharge, emailQueue } = buildDeps(subscription);

    await service.scan(new Date('2026-08-28T00:00:00Z'));

    expect(initiateCharge.execute).toHaveBeenCalledWith({
      organizationId: 'org-1',
      returnUrl: 'https://app.casso.vn/settings?tab=billing',
      cancelUrl: 'https://app.casso.vn/settings?tab=billing',
    });
    expect(emailQueue.add).toHaveBeenCalledWith(
      'send-owner-alert',
      expect.objectContaining({
        organizationId: 'org-1',
        to: 'owner@example.com',
      }),
      expect.objectContaining({
        jobId: expect.stringContaining('org-1'),
      }),
    );

    const [, job] = emailQueue.add.mock.calls[0];
    expect(job.html).toContain('cid:casso-ar-logo');
    expect(job.text).toContain('thanh toán');
    expect(job.attachments).toEqual([
      expect.objectContaining({ contentId: 'casso-ar-logo' }),
    ]);
  });

  it('does nothing when period end is not exactly the lead-day mark', async () => {
    const subscription = buildSubscriptionEndingIn(10);
    const { service, initiateCharge } = buildDeps(subscription);

    await service.scan(new Date('2026-08-28T00:00:00Z'));

    expect(initiateCharge.execute).not.toHaveBeenCalled();
  });

  it('does nothing when the current period is already paid', async () => {
    const subscription = buildSubscriptionEndingIn(3);
    const { service, initiateCharge, paymentStatus } = buildDeps(subscription);
    (paymentStatus.hasPaidCurrentPeriod as jest.Mock).mockResolvedValue(true);

    await service.scan(new Date('2026-08-28T00:00:00Z'));

    expect(initiateCharge.execute).not.toHaveBeenCalled();
  });
});
