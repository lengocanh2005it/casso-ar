import { PlanId } from '@casso-ar/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import { getPlanCatalog } from '../../billing/domain/subscription';
import {
  type IPayosPaymentAdapter,
  PAYOS_PAYMENT_ADAPTER,
} from './payos-payment-adapter.port';
import {
  type IPlanUpgradeOrderRepository,
  PLAN_UPGRADE_ORDER_REPOSITORY,
} from './plan-upgrade-order-repository.port';

export interface InitiatePlanUpgradeOrderInput {
  organizationId: string;
  targetPlanId: PlanId;
  returnUrl: string;
  cancelUrl: string;
}

export interface InitiatePlanUpgradeOrderResult {
  checkoutUrl: string;
}

@Injectable()
export class InitiatePlanUpgradeOrderUseCase {
  constructor(
    @Inject(PLAN_UPGRADE_ORDER_REPOSITORY)
    private readonly orderRepo: IPlanUpgradeOrderRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(PAYOS_PAYMENT_ADAPTER)
    private readonly payosAdapter: IPayosPaymentAdapter,
  ) {}

  async execute(
    input: InitiatePlanUpgradeOrderInput,
  ): Promise<InitiatePlanUpgradeOrderResult> {
    const subscription = await this.subscriptionRepo.findByOrganizationId(
      input.organizationId,
    );
    if (!subscription) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy gói đăng ký của tổ chức.',
      );
    }
    if (!subscription.isUpgradeTo(input.targetPlanId)) {
      throw new AppError(
        ErrorCode.INVALID_PLAN_TRANSITION,
        `Không thể nâng cấp sang gói ${input.targetPlanId} từ gói hiện tại.`,
      );
    }

    const order = await this.orderRepo.create({
      organizationId: input.organizationId,
      targetPlanId: input.targetPlanId,
    });

    const link = await this.payosAdapter.createPaymentLink({
      orderCode: order.orderCode,
      amount: getPlanCatalog().find((p) => p.planId === input.targetPlanId)!
        .priceVnd,
      description: `Nang cap goi ${input.targetPlanId}`,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });

    return { checkoutUrl: link.checkoutUrl };
  }
}
