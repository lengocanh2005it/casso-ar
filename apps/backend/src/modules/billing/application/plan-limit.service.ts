import { randomUUID } from 'node:crypto';
import { SubscriptionStatus } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Subscription } from '../domain/subscription';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from './subscription-repository.port';

@Injectable()
export class PlanLimitService {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly repo: ISubscriptionRepository,
    private readonly tenant: TenantContextService,
  ) {}

  // Must run inside the same transaction as the write it's gating.
  async enforceReceivableLimit(manager: EntityManager): Promise<void> {
    const organizationId = this.tenant.getOrganizationId();
    const now = new Date();

    let subscription = await this.repo.lockAndFindByOrganizationId(
      organizationId,
      manager,
    );
    if (!subscription) {
      subscription = Subscription.createFree(randomUUID(), organizationId, now);
      await this.repo.save(subscription, manager);
    } else {
      const rolled = subscription.rollToCurrentPeriodIfExpired(now);
      if (rolled !== subscription) {
        subscription = rolled;
        await this.repo.save(subscription, manager);
      }
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      this.throwPlanLimitExceeded(
        `Gói ${subscription.planId} đang ở trạng thái ${subscription.status}; vui lòng cập nhật thanh toán để tiếp tục.`,
      );
    }

    const receivablesThisMonth = await this.repo.countReceivablesInPeriod(
      organizationId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      manager,
    );

    if (subscription.isReceivableLimitReached(receivablesThisMonth)) {
      this.throwPlanLimitExceeded(
        `Đã đạt giới hạn gói ${subscription.planId}; vui lòng nâng cấp để tiếp tục.`,
      );
    }
  }

  async enforceCopilotChatLimit(manager: EntityManager): Promise<void> {
    const organizationId = this.tenant.getOrganizationId();
    const now = new Date();

    let subscription = await this.repo.lockAndFindByOrganizationId(
      organizationId,
      manager,
    );
    if (!subscription) {
      subscription = Subscription.createFree(randomUUID(), organizationId, now);
      await this.repo.save(subscription, manager);
    } else {
      const rolled = subscription.rollToCurrentPeriodIfExpired(now);
      if (rolled !== subscription) {
        subscription = rolled;
        await this.repo.save(subscription, manager);
      }
    }

    if (subscription.status !== SubscriptionStatus.ACTIVE) {
      this.throwPlanLimitExceeded(
        `Gói ${subscription.planId} đang ở trạng thái ${subscription.status}; vui lòng cập nhật thanh toán để tiếp tục.`,
      );
    }

    const chatTurnsThisMonth = await this.repo.countCopilotChatTurnsInPeriod(
      organizationId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      manager,
    );

    if (subscription.isCopilotChatLimitReached(chatTurnsThisMonth)) {
      this.throwPlanLimitExceeded(
        `Đã đạt giới hạn gói ${subscription.planId}; vui lòng nâng cấp để tiếp tục.`,
      );
    }
  }

  private throwPlanLimitExceeded(message: string): never {
    throw new AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, message);
  }
}
