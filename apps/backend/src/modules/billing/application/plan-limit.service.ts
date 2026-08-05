import { randomUUID } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
// biome-ignore lint/style/useImportType: must be a value import — NestJS DI resolves this constructor param via emitDecoratorMetadata's design:paramtypes, which erases type-only imports to `Function`
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

  // Must run inside the same transaction as the write it's gating: locks the
  // subscription row so two concurrent requests can't both slip past a limit
  // that has one slot left.
  async enforceReceivableLimit(manager: EntityManager): Promise<void> {
    const organizationId = this.tenant.getOrganizationId();
    const now = new Date();

    let subscription = await this.repo.findByOrganizationIdForUpdate(
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

    const receivablesThisMonth = await this.repo.countReceivablesInPeriod(
      organizationId,
      subscription.currentPeriodStart,
      subscription.currentPeriodEnd,
      manager,
    );

    if (subscription.isReceivableLimitReached(receivablesThisMonth)) {
      throw new HttpException(
        {
          statusCode: HttpStatus.PAYMENT_REQUIRED,
          errorCode: ErrorCode.PLAN_LIMIT_EXCEEDED,
          message: `Đã đạt giới hạn gói ${subscription.planId}; vui lòng nâng cấp để tiếp tục.`,
        },
        HttpStatus.PAYMENT_REQUIRED,
      );
    }
  }
}
