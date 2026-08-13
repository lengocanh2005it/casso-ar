import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ConfirmPlanUpgradeOrderUseCase } from './application/confirm-plan-upgrade-order.usecase';
import { InitiatePlanUpgradeOrderUseCase } from './application/initiate-plan-upgrade-order.usecase';
import { PAYOS_PAYMENT_ADAPTER } from './application/payos-payment-adapter.port';
import { PLAN_UPGRADE_ORDER_REPOSITORY } from './application/plan-upgrade-order-repository.port';
import { PayosAdapter } from './infrastructure/payos.adapter';
import { PlanUpgradeOrderOrmEntity } from './infrastructure/plan-upgrade-order.orm-entity';
import { TypeOrmPlanUpgradeOrderRepository } from './infrastructure/typeorm-plan-upgrade-order.repository';
import { PayosController } from './presentation/payos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PlanUpgradeOrderOrmEntity]),
    BillingModule,
    WebhooksModule,
  ],
  providers: [
    {
      provide: PLAN_UPGRADE_ORDER_REPOSITORY,
      useClass: TypeOrmPlanUpgradeOrderRepository,
    },
    { provide: PAYOS_PAYMENT_ADAPTER, useClass: PayosAdapter },
    InitiatePlanUpgradeOrderUseCase,
    ConfirmPlanUpgradeOrderUseCase,
  ],
  controllers: [PayosController],
})
export class PayosModule {}
