import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlanLimitService } from './application/plan-limit.service';
import { SUBSCRIPTION_REPOSITORY } from './application/subscription-repository.port';
import { SubscriptionOrmEntity } from './infrastructure/subscription.orm-entity';
import { TypeOrmSubscriptionRepository } from './infrastructure/typeorm-subscription.repository';

@Module({
  imports: [TypeOrmModule.forFeature([SubscriptionOrmEntity])],
  providers: [
    {
      provide: SUBSCRIPTION_REPOSITORY,
      useClass: TypeOrmSubscriptionRepository,
    },
    PlanLimitService,
  ],
  exports: [PlanLimitService, SUBSCRIPTION_REPOSITORY, TypeOrmModule],
})
export class BillingModule {}
