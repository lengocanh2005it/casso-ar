import { PlanId } from '@casso-ledger/shared-types';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource, type EntityManager } from 'typeorm';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import {
  AUDIT_LOG_REPOSITORY,
  type IAuditLogRepository,
} from '../../../common/audit/audit-log-repository.port';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import type { Subscription } from '../../billing/domain/subscription';
import { PeriodPaymentStatusService } from './period-payment-status.service';
import { RENEWAL_TIMEZONE } from './renewal-reminder-scanner.service';

export const NON_RENEWAL_GRACE_DAYS = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class NonRenewalDowngradeScannerService {
  private readonly logger = new Logger(NonRenewalDowngradeScannerService.name);

  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    private readonly paymentStatus: PeriodPaymentStatusService,
    @Inject(AUDIT_LOG_REPOSITORY)
    private readonly auditLogRepo: IAuditLogRepository,
    private readonly dataSource: DataSource,
  ) {}

  @Cron('0 4 * * *', { timeZone: RENEWAL_TIMEZONE })
  async scan(now: Date = new Date()): Promise<void> {
    const subscriptions = await this.subscriptionRepo.findAllPaidTierActive();
    for (const subscription of subscriptions) {
      try {
        await this.scanSubscription(subscription, now);
      } catch (error) {
        this.logger.error({
          message: 'Failed to scan subscription for non-renewal downgrade',
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
    const graceDeadline =
      subscription.currentPeriodEnd.getTime() +
      NON_RENEWAL_GRACE_DAYS * MS_PER_DAY;
    if (now.getTime() < graceDeadline) return;

    const paid = await this.paymentStatus.hasPaidCurrentPeriod(subscription);
    if (paid) return;

    await this.dataSource.transaction(async (manager: EntityManager) => {
      const locked = await this.subscriptionRepo.lockAndFindByOrganizationId(
        subscription.organizationId,
        manager,
      );
      if (!locked || locked.planId === PlanId.FREE) return;

      // Re-check inside the lock in case a webhook confirmed payment between
      // the unlocked read above and acquiring the lock here.
      const stillUnpaid =
        !(await this.paymentStatus.hasPaidCurrentPeriod(locked));
      if (!stillUnpaid) return;

      const downgraded = locked.revertToFreeForNonRenewal(now);
      await this.subscriptionRepo.save(
        downgraded,
        manager,
        subscription.organizationId,
      );
      await this.auditLogRepo.create(
        new AuditLog({
          organizationId: subscription.organizationId,
          userId: 'system',
          actionType: AuditActionType.SUBSCRIPTION_CHANGE_PLAN,
          entityType: AuditEntityType.SUBSCRIPTION,
          entityId: subscription.organizationId,
          beforeState: { planId: locked.planId },
          afterState: { planId: PlanId.FREE, reason: 'non-renewal' },
          ipAddress: null,
          createdAt: new Date(),
        }),
        manager,
      );
    });
  }
}
