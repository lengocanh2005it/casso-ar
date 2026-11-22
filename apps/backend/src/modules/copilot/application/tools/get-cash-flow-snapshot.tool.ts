import { Injectable } from '@nestjs/common';
import { TenantContextService } from '../../../../common/tenancy/tenant-context';
import { Role } from '../../../organizations/domain/membership';
import type { AgingBucketCount } from '../../../reporting/application/aging-report.repository.port';
import { AgingReportQueryService } from '../../../reporting/application/aging-report-query.service';
import type { DashboardSummary } from '../../../reporting/application/dashboard-summary.repository.port';
import { DashboardSummaryQueryService } from '../../../reporting/application/dashboard-summary-query.service';
import type {
  ReportsTrendPoint,
  TrendMonths,
} from '../../../reporting/application/trend-report.repository.port';
import { TrendReportQueryService } from '../../../reporting/application/trend-report-query.service';

export interface CashFlowSnapshot {
  dashboard: DashboardSummary;
  aging: AgingBucketCount[];
  trend: { months: TrendMonths; items: ReportsTrendPoint[] };
}

@Injectable()
export class GetCashFlowSnapshotTool {
  static readonly NAME = 'getCashFlowSnapshot';

  constructor(
    private readonly dashboard: DashboardSummaryQueryService,
    private readonly aging: AgingReportQueryService,
    private readonly trend: TrendReportQueryService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async execute(): Promise<CashFlowSnapshot> {
    const user = this.tenantContext.getCurrentUser();
    // ponytail: fixed 6-month window; narrower queries only if prompt cost
    // becomes measurable. Values are relayed, never recomputed here.
    const [dashboard, aging, trend] = await Promise.all([
      this.dashboard.getSummary(),
      user?.role === Role.SALES_REP
        ? this.aging.getAgingBuckets(user.userId)
        : this.aging.getAgingBuckets(),
      this.trend.getTrend(6),
    ]);

    return {
      dashboard,
      aging,
      trend: { months: trend.months, items: trend.items },
    };
  }
}
