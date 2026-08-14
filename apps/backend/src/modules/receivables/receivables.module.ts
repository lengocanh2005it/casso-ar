import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVENT_PUBLISHER } from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { BillingModule } from '../billing/billing.module';
import { CustomersModule } from '../customers/customers.module';
import { DisputesModule } from '../disputes/disputes.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PaymentsModule } from '../payments/payments.module';
import { BatchWriteOffReceivableUseCase } from './application/batch-write-off-receivable.usecase';
import { CancelReceivableUseCase } from './application/cancel-receivable.usecase';
import { CreateReceivableUseCase } from './application/create-receivable.usecase';
import { ExportReceivablesUseCase } from './application/export-receivables.usecase';
import { GetReceivableUseCase } from './application/get-receivable.usecase';
import { ListReceivablesUseCase } from './application/list-receivables.usecase';
import { RECEIVABLE_REPOSITORY } from './application/receivable-repository.port';
import { WriteOffReceivableUseCase } from './application/write-off-receivable.usecase';
import { ReceivableOrmEntity } from './infrastructure/receivable.orm-entity';
import { TypeOrmReceivableRepository } from './infrastructure/typeorm-receivable.repository';
import { ReceivablesController } from './presentation/receivables.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ReceivableOrmEntity]),
    CustomersModule,
    BillingModule,
    InvoicesModule,
    forwardRef(() => DisputesModule),
    forwardRef(() => PaymentsModule),
  ],
  providers: [
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    CreateReceivableUseCase,
    CancelReceivableUseCase,
    WriteOffReceivableUseCase,
    BatchWriteOffReceivableUseCase,
    GetReceivableUseCase,
    ListReceivablesUseCase,
    ExportReceivablesUseCase,
  ],
  controllers: [ReceivablesController],
  exports: [
    RECEIVABLE_REPOSITORY,
    TypeOrmModule,
    CreateReceivableUseCase,
    WriteOffReceivableUseCase,
  ],
})
export class ReceivablesModule {}
