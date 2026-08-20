import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { buildCassoEmail } from '../../../common/email/casso-email-template';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { ISubscriptionRepository } from '../../billing/application/subscription-repository.port';
import { SUBSCRIPTION_REPOSITORY } from '../../billing/application/subscription-repository.port';
import type { Subscription } from '../../billing/domain/subscription';
import {
  EMAIL_QUEUE_PORT,
  type IEmailQueue,
} from '../../notifications/application/email-queue.port';
import {
  type IMembershipRepository,
  MEMBERSHIP_REPOSITORY,
} from '../../organizations/application/membership-repository.port';
import { Role } from '../../organizations/domain/membership';
import {
  type IUserRepository,
  USER_REPOSITORY,
} from '../../users/application/user-repository.port';
import { InitiatePeriodChargeUseCase } from './initiate-period-charge.usecase';
import { PeriodPaymentStatusService } from './period-payment-status.service';

export const RENEWAL_REMINDER_LEAD_DAYS = 3;
export const RENEWAL_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function calendarDaysUntil(target: Date, now: Date): number {
  return Math.round((target.getTime() - now.getTime()) / MS_PER_DAY);
}

@Injectable()
export class RenewalReminderScannerService {
  private readonly logger = new Logger(RenewalReminderScannerService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly paymentStatus: PeriodPaymentStatusService,
    private readonly initiateCharge: InitiatePeriodChargeUseCase,
    @Inject(MEMBERSHIP_REPOSITORY)
    private readonly membershipRepo: IMembershipRepository,
    @Inject(USER_REPOSITORY)
    private readonly userRepo: IUserRepository,
    @Inject(EMAIL_QUEUE_PORT)
    private readonly emailQueue: IEmailQueue,
    private readonly tenantContext: TenantContextService,
  ) {}

  @Cron('0 3 * * *', { timeZone: RENEWAL_TIMEZONE })
  async scan(now: Date = new Date()): Promise<void> {
    const subscriptions = await this.subscriptionRepo.findAllPaidTierActive();
    for (const subscription of subscriptions) {
      try {
        await this.scanSubscription(subscription, now);
      } catch (error) {
        this.logger.error({
          message: 'Failed to scan subscription for renewal reminder',
          organizationId: subscription.organizationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async scanSubscription(
    subscription: Subscription,
    now: Date,
  ): Promise<void> {
    const daysUntilPeriodEnd = calendarDaysUntil(
      subscription.currentPeriodEnd,
      now,
    );
    if (daysUntilPeriodEnd !== RENEWAL_REMINDER_LEAD_DAYS) return;

    const alreadyPaid =
      await this.paymentStatus.hasPaidCurrentPeriod(subscription);
    if (alreadyPaid) return;

    // ponytail: this fires exactly once per period (the exact-day check
    // above), and the PeriodCharge is created before the email is enqueued —
    // if emailQueue.add throws (Redis blip, etc.), the org gets no checkout
    // link and no second reminder until next period (the charge itself is
    // still payable via the billing page, just without a proactive nudge).
    // Add a retry/dead-letter path here if silent missed reminders become a
    // real support burden.
    await this.tenantContext.run(
      {
        userId: 'system',
        organizationId: subscription.organizationId,
        role: Role.OWNER,
      },
      async () => {
        const { checkoutUrl } = await this.initiateCharge.execute({
          organizationId: subscription.organizationId,
          returnUrl: 'https://app.casso.vn/billing?status=success',
          cancelUrl: 'https://app.casso.vn/billing?status=cancelled',
        });

        const membership = await this.membershipRepo.findOwnerByOrganization(
          subscription.organizationId,
        );
        const owner = membership
          ? await this.userRepo.findById(membership.userId)
          : null;
        if (!owner?.email) return;

        const expiryDate = subscription.currentPeriodEnd
          .toISOString()
          .slice(0, 10);
        const content = buildCassoEmail({
          title: `Thông báo gia hạn gói ${subscription.planId}`,
          greeting: 'Kính chào Quý khách,',
          paragraphs: [
            `Gói ${subscription.planId} của Quý khách sẽ hết hạn vào ${expiryDate}. Vui lòng thanh toán để tiếp tục sử dụng dịch vụ.`,
          ],
          action: { label: 'Thanh toán gia hạn', url: checkoutUrl },
        });
        await this.emailQueue.add(
          'send-owner-alert',
          {
            organizationId: subscription.organizationId,
            to: owner.email,
            subject: `Gói ${subscription.planId} của bạn sắp hết hạn`,
            html: content.html,
            text: content.text,
            attachments: content.attachments,
          },
          {
            jobId: `renewal-reminder-${subscription.organizationId}-${subscription.currentPeriodStart.toISOString().slice(0, 10)}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 },
          },
        );
      },
    );
  }
}
