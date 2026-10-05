import { PlanId } from '@casso-ar/shared-types';
import { Inject, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
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
  type IPeriodChargeRepository,
  PERIOD_CHARGE_REPOSITORY,
} from './period-charge-repository.port';

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
    private readonly dataSource: DataSource,
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

    const currentPlan = getPlanCatalog().find(
      (p) => p.planId === subscription.planId,
    );
    if (!currentPlan) {
      throw new AppError(
        ErrorCode.INVALID_PLAN_TRANSITION,
        `Không tìm thấy cấu hình gói ${subscription.planId}.`,
      );
    }
    const quotedAmount = currentPlan.priceVnd;
    const charge = await this.dataSource.transaction((manager) =>
      this.chargeRepo.create(
        {
          organizationId: input.organizationId,
          planId: subscription.planId,
          periodStart: subscription.currentPeriodStart,
          periodEnd: subscription.currentPeriodEnd,
          quotedAmount,
        },
        manager,
      ),
    );

    const link = await this.payosAdapter.createPaymentLink({
      orderCode: charge.orderCode,
      amount: quotedAmount,
      description: `Gia han goi ${subscription.planId}`,
      returnUrl: input.returnUrl,
      cancelUrl: input.cancelUrl,
    });

    await this.chargeRepo.save(
      charge.withPayosPaymentLinkId(link.paymentLinkId),
      undefined,
      input.organizationId,
    );

    return { checkoutUrl: link.checkoutUrl };
  }
}
