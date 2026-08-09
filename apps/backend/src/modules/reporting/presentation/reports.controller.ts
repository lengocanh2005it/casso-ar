import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { Permission } from '../../../common/rbac/permission.enum';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { AgingReportQueryService } from '../application/aging-report-query.service';
import { DashboardSummaryQueryService } from '../application/dashboard-summary-query.service';
import { GetDashboardSummaryQueryDto } from './dto/get-dashboard-summary-query.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(
    private readonly agingReportQueryService: AgingReportQueryService,
    private readonly dashboardSummaryQueryService: DashboardSummaryQueryService,
  ) {}

  @Get('aging')
  @RequirePermission(Permission.REPORT_READ)
  async getAgingReport() {
    return { buckets: await this.agingReportQueryService.getAgingBuckets() };
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
