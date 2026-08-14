import { Module } from '@nestjs/common';
import { AGING_REPORT_REPOSITORY } from './application/aging-report.repository.port';
import { AgingReportQueryService } from './application/aging-report-query.service';
import { CUSTOMER_AGING_REPORT_REPOSITORY } from './application/customer-aging-report.repository.port';
import { CustomerAgingReportQueryService } from './application/customer-aging-report-query.service';
import { DASHBOARD_SUMMARY_REPOSITORY } from './application/dashboard-summary.repository.port';
import { DashboardSummaryQueryService } from './application/dashboard-summary-query.service';
import { ExportAgingReportUseCase } from './application/export-aging-report.usecase';
import { TREND_REPORT_REPOSITORY } from './application/trend-report.repository.port';
import { TrendReportQueryService } from './application/trend-report-query.service';
import { TypeOrmAgingReportRepository } from './infrastructure/typeorm-aging-report.repository';
import { TypeOrmCustomerAgingReportRepository } from './infrastructure/typeorm-customer-aging-report.repository';
import { TypeOrmDashboardSummaryRepository } from './infrastructure/typeorm-dashboard-summary.repository';
import { TypeOrmTrendReportRepository } from './infrastructure/typeorm-trend-report.repository';
import { ReportsController } from './presentation/reports.controller';

@Module({
  providers: [
    {
      provide: AGING_REPORT_REPOSITORY,
      useClass: TypeOrmAgingReportRepository,
    },
    {
      provide: CUSTOMER_AGING_REPORT_REPOSITORY,
      useClass: TypeOrmCustomerAgingReportRepository,
    },
    {
      provide: DASHBOARD_SUMMARY_REPOSITORY,
      useClass: TypeOrmDashboardSummaryRepository,
    },
    {
      provide: TREND_REPORT_REPOSITORY,
      useClass: TypeOrmTrendReportRepository,
    },
    AgingReportQueryService,
    CustomerAgingReportQueryService,
    DashboardSummaryQueryService,
    TrendReportQueryService,
    ExportAgingReportUseCase,
  ],
  controllers: [ReportsController],
})
export class ReportingModule {}
