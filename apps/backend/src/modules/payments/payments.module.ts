import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AUDIT_LOG_REPOSITORY } from '../../common/audit/audit-log-repository.port';
import { TypeOrmAuditLogRepository } from '../../common/audit/typeorm-audit-log.repository';
import { ReceivablesModule } from '../receivables/receivables.module';
import { AllocatePaymentUseCase } from './application/allocate-payment.usecase';
import { PAYMENT_ALLOCATION_REPOSITORY } from './application/payment-allocation-repository.port';
import { PAYMENT_REPOSITORY } from './application/payment-repository.port';
import { UndoPaymentAllocationUseCase } from './application/undo-payment-allocation.usecase';
import { PaymentAllocationOrmEntity } from './infrastructure/payment-allocation.orm-entity';
import { PaymentOrmEntity } from './infrastructure/payment.orm-entity';
import { TypeOrmPaymentAllocationRepository } from './infrastructure/typeorm-payment-allocation.repository';
import { TypeOrmPaymentRepository } from './infrastructure/typeorm-payment.repository';

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
    { provide: AUDIT_LOG_REPOSITORY, useClass: TypeOrmAuditLogRepository },
    AllocatePaymentUseCase,
    UndoPaymentAllocationUseCase,
  ],
  exports: [
    PAYMENT_REPOSITORY,
    PAYMENT_ALLOCATION_REPOSITORY,
    AllocatePaymentUseCase,
    UndoPaymentAllocationUseCase,
  ],
})
export class PaymentsModule {}
