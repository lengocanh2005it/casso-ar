import { Module } from '@nestjs/common';
import { ListAuditLogsUseCase } from './application/list-audit-logs.usecase';
import { AuditLogsController } from './presentation/audit-logs.controller';

@Module({
  controllers: [AuditLogsController],
  providers: [ListAuditLogsUseCase],
})
export class AuditLogsModule {}
