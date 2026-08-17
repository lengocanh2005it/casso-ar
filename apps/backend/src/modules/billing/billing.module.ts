import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChangeSubscriptionPlanUseCase } from './application/change-subscription-plan.usecase';
import { GetPublicPlansUseCase } from './application/get-public-plans.usecase';
import { PlanLimitService } from './application/plan-limit.service';
import { SUBSCRIPTION_REPOSITORY } from './application/subscription-repository.port';
import { SubscriptionOrmEntity } from './infrastructure/subscription.orm-entity';
import { TypeOrmSubscriptionRepository } from './infrastructure/typeorm-subscription.repository';
import { PublicPlansController } from './presentation/public-plans.controller';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionOrmEntity])],
  controllers: [PublicPlansController],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: TypeOrmSubscriptionRepository,
    },
    PlanLimitService,
    ChangeSubscriptionPlanUseCase,
    GetPublicPlansUseCase,
  ],
  exports: [
    PlanLimitService,
    SUBSCRIPTION_REPOSITORY,
    ChangeSubscriptionPlanUseCase,
    TypeOrmModule,
  ],
})
export class BillingModule {}
