import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReceivablesModule } from '../receivables/receivables.module';
import { CollectionActivityListener } from './application/collection-activity.listener';
import { COLLECTION_ACTIVITY_REPOSITORY } from './application/collection-activity-repository.port';
import { GetCustomerTimelineUseCase } from './application/get-customer-timeline.usecase';
import { GetReceivableTimelineUseCase } from './application/get-receivable-timeline.usecase';
import { RecordManualActivityUseCase } from './application/record-manual-activity.usecase';
import { CollectionActivityOrmEntity } from './infrastructure/collection-activity.orm-entity';
import { TypeOrmCollectionActivityRepository } from './infrastructure/typeorm-collection-activity.repository';
import { CollectionActivityController } from './presentation/collection-activity.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectionActivityOrmEntity]),
    ReceivablesModule,
  ],
  providers: [
    {
      provide: COLLECTION_ACTIVITY_REPOSITORY,
      useClass: TypeOrmCollectionActivityRepository,
    },
    RecordManualActivityUseCase,
    GetReceivableTimelineUseCase,
    GetCustomerTimelineUseCase,
    CollectionActivityListener,
  ],
  controllers: [CollectionActivityController],
  exports: [COLLECTION_ACTIVITY_REPOSITORY, RecordManualActivityUseCase],
})
export class CollectionActivityModule {}
