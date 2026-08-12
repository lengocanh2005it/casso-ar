import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { AgingReportQueryService } from '../application/aging-report-query.service';
import { DashboardSummaryQueryService } from '../application/dashboard-summary-query.service';
import { ExportAgingReportUseCase } from '../application/export-aging-report.usecase';
import { GetDashboardSummaryQueryDto } from './dto/get-dashboard-summary-query.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(
    private readonly agingReportQueryService: AgingReportQueryService,
    private readonly dashboardSummaryQueryService: DashboardSummaryQueryService,
    private readonly exportAgingReportUseCase: ExportAgingReportUseCase,
  ) {}

  @Get('aging')
  @RequirePermission(Permission.REPORT_READ)
  async getAgingReport() {
    return { buckets: await this.agingReportQueryService.getAgingBuckets() };
  }

  @Get('aging/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="aging-report.csv"')
  @RequirePermission(Permission.REPORT_READ)
  async exportAgingReport(@Res() response: Response) {
    response.send(await this.exportAgingReportUseCase.execute());
  }

  @Get('dashboard-summary')
  @RequirePermission(Permission.REPORT_READ)
  async getDashboardSummary(@Query() query: GetDashboardSummaryQueryDto) {
    const period =
      query.from && query.to
        ? { from: new Date(query.from), to: new Date(query.to) }
        : undefined;
    return this.dashboardSummaryQueryService.getSummary(period);
  }
}
