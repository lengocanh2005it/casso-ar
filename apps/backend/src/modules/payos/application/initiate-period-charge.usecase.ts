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
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';
import { PLAN_PRICE_VND } from './plan-price';

export interface InitiatePeriodChargeInput {
  organizationId: string;
  returnUrl: string;
  cancelUrl: string;
}

export interface InitiatePeriodChargeResult {
  checkoutUrl: string;
}

@Injectable()
export class InitiatePeriodChargeUseCase {
  constructor(
    @Inject(PERIOD_CHARGE_REPOSITORY)
    private readonly chargeRepo: IPeriodChargeRepository,
    @Inject(SUBSCRIPTION_REPOSITORY)
    private readonly subscriptionRepo: ISubscriptionRepository,
    @Inject(PAYOS_PAYMENT_ADAPTER)
    private readonly payosAdapter: IPayosPaymentAdapter,
  ) {}

  async execute(
    input: InitiatePeriodChargeInput,
  ): Promise<InitiatePeriodChargeResult> {
    const subscription = await this.subscriptionRepo.findByOrganizationId(
      input.organizationId,
    );
    if (!subscription) {
      throw new AppError(
        ErrorCode.NOT_FOUND,
        'Không tìm thấy gói đăng ký của tổ chức.',
      );
    }
    if (subscription.planId === PlanId.FREE) {
      throw new AppError(
        ErrorCode.INVALID_PLAN_TRANSITION,
        'Gói FREE không cần gia hạn.',
      );
    }

    const charge = await this.chargeRepo.create({
      organizationId: input.organizationId,
      planId: subscription.planId,
      periodStart: subscription.currentPeriodStart,
      periodEnd: subscription.currentPeriodEnd,
    });

    const link = await this.payosAdapter.createPaymentLink({
      orderCode: charge.orderCode,
      amount: PLAN_PRICE_VND[subscription.planId],
      description: `Gia han goi ${subscription.planId}`,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });

    return { checkoutUrl: link.checkoutUrl };
  }
}
