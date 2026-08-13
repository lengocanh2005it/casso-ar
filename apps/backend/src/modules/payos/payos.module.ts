import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
import { UsersModule } from '../users/users.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { ConfirmPeriodChargeUseCase } from './application/confirm-period-charge.usecase';
import { ConfirmPlanUpgradeOrderUseCase } from './application/confirm-plan-upgrade-order.usecase';
import { InitiatePeriodChargeUseCase } from './application/initiate-period-charge.usecase';
import { InitiatePlanUpgradeOrderUseCase } from './application/initiate-plan-upgrade-order.usecase';
import { NonRenewalDowngradeScannerService } from './application/non-renewal-downgrade-scanner.service';
import { PAYOS_PAYMENT_ADAPTER } from './application/payos-payment-adapter.port';
import { PERIOD_CHARGE_REPOSITORY } from './application/period-charge-repository.port';
import { PeriodPaymentStatusService } from './application/period-payment-status.service';
import { PLAN_UPGRADE_ORDER_REPOSITORY } from './application/plan-upgrade-order-repository.port';
import { RenewalReminderScannerService } from './application/renewal-reminder-scanner.service';
import { PayosAdapter } from './infrastructure/payos.adapter';
import { PeriodChargeOrmEntity } from './infrastructure/period-charge.orm-entity';
import { PlanUpgradeOrderOrmEntity } from './infrastructure/plan-upgrade-order.orm-entity';
import { TypeOrmPeriodChargeRepository } from './infrastructure/typeorm-period-charge.repository';
import { TypeOrmPlanUpgradeOrderRepository } from './infrastructure/typeorm-plan-upgrade-order.repository';
import { PayosController } from './presentation/payos.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PlanUpgradeOrderOrmEntity,
      PeriodChargeOrmEntity,
    ]),
    BillingModule,
    WebhooksModule,
    NotificationsModule,
    OrganizationsModule,
    UsersModule,
  ],
  providers: [
    {
      provide: PLAN_UPGRADE_ORDER_REPOSITORY,
      useClass: TypeOrmPlanUpgradeOrderRepository,
    },
    {
      provide: PERIOD_CHARGE_REPOSITORY,
      useClass: TypeOrmPeriodChargeRepository,
    },
    { provide: PAYOS_PAYMENT_ADAPTER, useClass: PayosAdapter },
    InitiatePlanUpgradeOrderUseCase,
    ConfirmPlanUpgradeOrderUseCase,
    InitiatePeriodChargeUseCase,
    ConfirmPeriodChargeUseCase,
    PeriodPaymentStatusService,
    RenewalReminderScannerService,
    NonRenewalDowngradeScannerService,
  ],
  controllers: [PayosController],
})
export class PayosModule {}
