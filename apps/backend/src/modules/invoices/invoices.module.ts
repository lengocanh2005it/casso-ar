import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { INVOICE_REPOSITORY } from './application/invoice-repository.port';
import { InvoiceOrmEntity } from './infrastructure/invoice.orm-entity';
import { TypeOrmInvoiceRepository } from './infrastructure/typeorm-invoice.repository';

@Module({
  imports: [TypeOrmModule.forFeature([InvoiceOrmEntity])],
  providers: [
    { provide: INVOICE_REPOSITORY, useClass: TypeOrmInvoiceRepository },
  ],
  exports: [INVOICE_REPOSITORY],
})
export class InvoicesModule {}
