import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PAYMENT_ALLOCATION_REPOSITORY } from './application/payment-allocation-repository.port';
import { PAYMENT_REPOSITORY } from './application/payment-repository.port';
import { PaymentAllocationOrmEntity } from './infrastructure/payment-allocation.orm-entity';
import { PaymentOrmEntity } from './infrastructure/payment.orm-entity';
import { TypeOrmPaymentAllocationRepository } from './infrastructure/typeorm-payment-allocation.repository';
import { TypeOrmPaymentRepository } from './infrastructure/typeorm-payment.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentOrmEntity, PaymentAllocationOrmEntity]),
  ],
  providers: [
    { provide: PAYMENT_REPOSITORY, useClass: TypeOrmPaymentRepository },
    {
      provide: PAYMENT_ALLOCATION_REPOSITORY,
      useClass: TypeOrmPaymentAllocationRepository,
    },
  ],
  exports: [PAYMENT_REPOSITORY, PAYMENT_ALLOCATION_REPOSITORY],
})
export class PaymentsModule {}
