import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BillingModule } from '../billing/billing.module';
import { CustomersModule } from '../customers/customers.module';
import { CreateReceivableUseCase } from './application/create-receivable.usecase';
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
  ],
  providers: [
    { provide: RECEIVABLE_REPOSITORY, useClass: TypeOrmReceivableRepository },
    CreateReceivableUseCase,
    WriteOffReceivableUseCase,
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
