import { Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { ListAuditLogsUseCase } from './application/list-audit-logs.usecase';
import { AuditLogsController } from './presentation/audit-logs.controller';

@Module({
  imports: [CustomersModule, InvoicesModule],
  controllers: [AuditLogsController],
  providers: [ListAuditLogsUseCase],
})
export class AuditLogsModule {}
