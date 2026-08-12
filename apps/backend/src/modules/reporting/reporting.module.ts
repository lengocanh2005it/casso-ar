import { Module } from '@nestjs/common';
import { AGING_REPORT_REPOSITORY } from './application/aging-report.repository.port';
import { AgingReportQueryService } from './application/aging-report-query.service';
import { DASHBOARD_SUMMARY_REPOSITORY } from './application/dashboard-summary.repository.port';
import { DashboardSummaryQueryService } from './application/dashboard-summary-query.service';
import { ExportAgingReportUseCase } from './application/export-aging-report.usecase';
import { TypeOrmAgingReportRepository } from './infrastructure/typeorm-aging-report.repository';
import { TypeOrmDashboardSummaryRepository } from './infrastructure/typeorm-dashboard-summary.repository';
import { ReportsController } from './presentation/reports.controller';

@Module({
  providers: [
    {
      provide: AGING_REPORT_REPOSITORY,
      useClass: TypeOrmAgingReportRepository,
    },
    {
      provide: DASHBOARD_SUMMARY_REPOSITORY,
      useClass: TypeOrmDashboardSummaryRepository,
    },
    AgingReportQueryService,
    DashboardSummaryQueryService,
    ExportAgingReportUseCase,
  ],
  controllers: [ReportsController],
})
export class ReportingModule {}
