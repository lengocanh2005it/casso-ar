import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeSubscriptionPlanUseCase } from './application/change-subscription-plan.usecase';
import { PlanLimitService } from './application/plan-limit.service';
import { SUBSCRIPTION_REPOSITORY } from './application/subscription-repository.port';
import { SubscriptionOrmEntity } from './infrastructure/subscription.orm-entity';
import { TypeOrmSubscriptionRepository } from './infrastructure/typeorm-subscription.repository';
import { BillingController } from './presentation/billing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionOrmEntity])],
  controllers: [BillingController],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: TypeOrmSubscriptionRepository,
    },
    PlanLimitService,
    ChangeSubscriptionPlanUseCase,
  ],
  exports: [PlanLimitService, SUBSCRIPTION_REPOSITORY, TypeOrmModule],
})
export class BillingModule {}
