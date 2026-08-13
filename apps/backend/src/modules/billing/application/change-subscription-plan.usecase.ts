import type { PlanId } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import type { Subscription } from '../domain/subscription';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from './subscription-repository.port';

@Injectable()
export class ChangeSubscriptionPlanUseCase {
  constructor(
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly repo: ISubscriptionRepository,
    private readonly dataSource: DataSource,
  ) {}

  async execute(
    organizationId: string,
    newPlanId: PlanId,
    existingManager?: EntityManager,
  ): Promise<Subscription> {
    const run = async (manager: EntityManager) => {
      const subscription = await this.repo.lockAndFindByOrganizationId(
        organizationId,
        manager,
      );
      if (!subscription) {
        throw new AppError(
          ErrorCode.NOT_FOUND,
          'Không tìm thấy gói đăng ký của tổ chức.',
        );
      }

      let updated: Subscription;
      try {
        updated = subscription.changeToPlan(newPlanId);
      } catch (error) {
        throw new AppError(
          ErrorCode.INVALID_PLAN_TRANSITION,
          error instanceof Error
            ? error.message
            : `Không thể chuyển sang gói ${newPlanId} từ gói hiện tại.`,
        );
      }

      await this.repo.save(updated, manager, organizationId);
      return updated;
    };

    if (existingManager) {
      return run(existingManager);
    }

    return this.dataSource.transaction(run);
  }
}
