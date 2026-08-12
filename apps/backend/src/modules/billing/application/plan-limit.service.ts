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
    const subscription = await this.lockActiveSubscription(manager);

    const receivablesThisMonth = await this.repo.countReceivablesInPeriod(
      subscription.organizationId,
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
    const subscription = await this.lockActiveSubscription(manager);

    const chatTurnsThisMonth = await this.repo.countCopilotChatTurnsInPeriod(
      subscription.organizationId,
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

  // Caller counts ACTIVE connections inside the same transaction (issue #101)
  // and passes the count here; the subscription lock serializes concurrent
  // exchanges per organization.
  async enforceBankConnectionLimit(
    manager: EntityManager,
    activeCount: number,
  ): Promise<void> {
    const subscription = await this.lockActiveSubscription(manager);
    if (activeCount >= subscription.bankConnectionLimit) {
      this.throwPlanLimitExceeded(
        `Đã đạt giới hạn gói ${subscription.planId}; vui lòng nâng cấp để tiếp tục.`,
      );
    }
  }

  // Read-side view of the Copilot usage gate (issue #132): same advisory-lock
  // + period-roll semantics as the enforcing path, but never throws — a
  // non-ACTIVE subscription still reports its usage/limits.
  async getCopilotUsage(manager: EntityManager): Promise<{
    turnsUsed: number;
    turnsLimit: number;
    periodStart: Date;
    periodEnd: Date;
  }> {
    const organizationId = this.tenant.getOrganizationId();
    const now = new Date();

    let subscription = await this.repo.lockAndFindByOrganizationId(
      organizationId,
      manager,
    );
    if (!subscription) {
      subscription = Subscription.createFree(randomUUID(), organizationId, now);
    } else {
      const rolled = subscription.rollToCurrentPeriodIfExpired(now);
      if (rolled !== subscription) subscription = rolled;
    }

    const turnsUsed = await this.repo.countCopilotChatTurnsInPeriod(
      subscription.organizationId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      manager,
    );
    return {
      turnsUsed,
      turnsLimit: subscription.copilotChatMonthlyLimit,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    };
  }

  // Shared by every limit check: lock the subscription, roll its billing
  // period if expired, and reject a non-ACTIVE subscription before the
  // caller counts usage.
  private async lockActiveSubscription(
    manager: EntityManager,
  ): Promise<Subscription> {
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

    return subscription;
  }

  private throwPlanLimitExceeded(message: string): never {
    throw new AppError(ErrorCode.PLAN_LIMIT_EXCEEDED, message);
  }
}
