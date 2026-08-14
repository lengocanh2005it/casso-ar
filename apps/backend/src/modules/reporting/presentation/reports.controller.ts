import { Permission } from '@casso-ledger/shared-types';
import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { ErrorCode } from '../../../common/errors/error-code';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { RequirePermission } from '../../../common/rbac/require-permission.decorator';
import { ApiErrorResponse } from '../../../common/swagger/api-error-response.decorator';
import { AgingReportQueryService } from '../application/aging-report-query.service';
import { CustomerAgingReportQueryService } from '../application/customer-aging-report-query.service';
import { DashboardSummaryQueryService } from '../application/dashboard-summary-query.service';
import { ExportAgingReportUseCase } from '../application/export-aging-report.usecase';
import { TrendReportQueryService } from '../application/trend-report-query.service';
import { CustomerAgingResponseDto } from './dto/customer-aging-response.dto';
import { GetCustomerAgingQueryDto } from './dto/get-customer-aging-query.dto';
import { GetDashboardSummaryQueryDto } from './dto/get-dashboard-summary-query.dto';
import { GetReportsTrendQueryDto } from './dto/get-reports-trend-query.dto';
import { ReportsTrendResponseDto } from './dto/reports-trend-response.dto';

@ApiTags('reports')
@Controller('reports')
@UseGuards(JwtAuthGuard, PermissionGuard)
export class ReportsController {
  constructor(
    private readonly agingReportQueryService: AgingReportQueryService,
    private readonly dashboardSummaryQueryService: DashboardSummaryQueryService,
    private readonly exportAgingReportUseCase: ExportAgingReportUseCase,
    private readonly customerAgingReportQueryService: CustomerAgingReportQueryService,
    private readonly trendReportQueryService: TrendReportQueryService,
  ) {}

  @Get('aging')
  @RequirePermission(Permission.REPORT_READ)
  async getAgingReport() {
    return { buckets: await this.agingReportQueryService.getAgingBuckets() };
  }

  @Get('aging/customers')
  @ApiOperation({ summary: 'List customer aging report' })
  @ApiOkResponse({ type: CustomerAgingResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @RequirePermission(Permission.REPORT_READ)
  async getCustomerAging(@Query() query: GetCustomerAgingQueryDto) {
    return this.customerAgingReportQueryService.getCustomerAging({
      page: query.page,
      limit: query.limit,
      search: query.search,
      bucket: query.bucket,
    });
  }

  @Get('aging/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="aging-report.csv"')
  @RequirePermission(Permission.REPORT_READ)
  async exportAgingReport(@Res() response: Response) {
    response.send(await this.exportAgingReportUseCase.execute());
  }

  @Get('trend')
  @ApiOperation({ summary: 'Get monthly collected and outstanding trend' })
  @ApiOkResponse({ type: ReportsTrendResponseDto })
  @ApiErrorResponse(
    ErrorCode.VALIDATION_ERROR,
    ErrorCode.UNAUTHORIZED,
    ErrorCode.FORBIDDEN,
  )
  @RequirePermission(Permission.REPORT_READ)
  async getReportsTrend(@Query() query: GetReportsTrendQueryDto) {
    return this.trendReportQueryService.getTrend(query.months);
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
