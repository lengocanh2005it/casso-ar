import { PlanId } from '@casso-ledger/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import {
  type ISubscriptionRepository,
  SUBSCRIPTION_REPOSITORY,
} from '../../billing/application/subscription-repository.port';
import {
  type IPayosPaymentAdapter,
  PAYOS_PAYMENT_ADAPTER,
} from './payos-payment-adapter.port';
import {
  type IPlanUpgradeOrderRepository,
  PLAN_UPGRADE_ORDER_REPOSITORY,
} from './plan-upgrade-order-repository.port';

// PayOS checkout amount per plan — distinct from Subscription's PLAN_CATALOG,
// which tracks usage limits, not price.
const PLAN_PRICE_VND: Record<PlanId, number> = {
  [PlanId.FREE]: 0,
  [PlanId.STARTER]: 299_000,
  [PlanId.BUSINESS]: 999_000,
  [PlanId.ENTERPRISE]: 2_999_000,
};

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
      amount: PLAN_PRICE_VND[input.targetPlanId],
      description: `Nang cap goi ${input.targetPlanId}`,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });

    return { checkoutUrl: link.checkoutUrl };
  }
}
