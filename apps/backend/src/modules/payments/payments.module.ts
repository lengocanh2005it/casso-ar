import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EVENT_PUBLISHER } from '../../common/events/event-publisher.port';
import { NestEventPublisherAdapter } from '../../common/events/nest-event-publisher.adapter';
import { ReceivablesModule } from '../receivables/receivables.module';
import { AllocatePaymentUseCase } from './application/allocate-payment.usecase';
import { PAYMENT_ALLOCATION_REPOSITORY } from './application/payment-allocation-repository.port';
import { PAYMENT_REPOSITORY } from './application/payment-repository.port';
import { UndoPaymentAllocationUseCase } from './application/undo-payment-allocation.usecase';
import { PaymentOrmEntity } from './infrastructure/payment.orm-entity';
import { PaymentAllocationOrmEntity } from './infrastructure/payment-allocation.orm-entity';
import { TypeOrmPaymentRepository } from './infrastructure/typeorm-payment.repository';
import { TypeOrmPaymentAllocationRepository } from './infrastructure/typeorm-payment-allocation.repository';
import { PaymentsController } from './presentation/payments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentOrmEntity, PaymentAllocationOrmEntity]),
    ReceivablesModule,
  ],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    {
      provide: PAYMENT_ALLOCATION_REPOSITORY,
      useClass: TypeOrmPaymentAllocationRepository,
    },
    { provide: EVENT_PUBLISHER, useClass: NestEventPublisherAdapter },
    AllocatePaymentUseCase,
    UndoPaymentAllocationUseCase,
  ],
  controllers: [PaymentsController],
  exports: [
    PAYMENT_REPOSITORY,
    PAYMENT_ALLOCATION_REPOSITORY,
    AllocatePaymentUseCase,
    UndoPaymentAllocationUseCase,
  ],
})
export class PaymentsModule {}
