import { Module } from '@nestjs/common';
import { IdempotencyModule } from '../../common/idempotency/idempotency.module';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ReceivablesModule } from '../receivables/receivables.module';
import { IMPORT_FILE_ROW_PARSER } from './application/import-file-row-parser.port';
import { ImportInvoicesUseCase } from './application/import-invoices.usecase';
import { parseFileToRows } from './infrastructure/file-row-parser';
import { InvoiceImportController } from './presentation/invoice-import.controller';

@Module({
  imports: [
    CustomersModule,
    InvoicesModule,
    ReceivablesModule,
    IdempotencyModule,
  ],
  controllers: [InvoiceImportController],
  providers: [
    ImportInvoicesUseCase,
    {
      provide: IMPORT_FILE_ROW_PARSER,
      useValue: { parseFileToRows },
    },
  ],
})
export class InvoiceImportModule {}
