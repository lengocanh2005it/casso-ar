import { Inject, Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import {
  DASHBOARD_SUMMARY_REPOSITORY,
  type DashboardPeriod,
  type DashboardSummary,
  type IDashboardSummaryRepository,
} from './dashboard-summary.repository.port';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';

function currentMonthPeriod(now = new Date()): DashboardPeriod {
  const month = formatInTimeZone(now, REPORTING_TIMEZONE, 'yyyy-MM');
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth =
    monthNumber === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;

  return {
    from: fromZonedTime(`${month}-01T00:00:00`, REPORTING_TIMEZONE),
    to: fromZonedTime(`${nextMonth}-01T00:00:00`, REPORTING_TIMEZONE),
  };
}

@Injectable()
export class DashboardSummaryQueryService {
  constructor(
    @Inject(DASHBOARD_SUMMARY_REPOSITORY)
    private readonly dashboardSummaryRepo: IDashboardSummaryRepository,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getSummary(period?: DashboardPeriod): Promise<DashboardSummary> {
    const organizationId = this.tenantContext.getOrganizationId();
    const user = this.tenantContext.getCurrentUser();
    const effectivePeriod = period ?? currentMonthPeriod();
    const topOverdueCustomersPromise =
      user?.role === Role.SALES_REP
        ? this.dashboardSummaryRepo.getTopOverdueCustomers(
            organizationId,
            user.userId,
          )
        : this.dashboardSummaryRepo.getTopOverdueCustomers(organizationId);
    const [outstanding, forecast, topOverdueCustomers, autoMatch, reminder] =
      await Promise.all([
        this.dashboardSummaryRepo.getOutstandingSummary(organizationId),
        this.dashboardSummaryRepo.getForecast(organizationId),
        topOverdueCustomersPromise,
        this.dashboardSummaryRepo.getAutoMatchStats(
          organizationId,
          effectivePeriod,
        ),
        this.dashboardSummaryRepo.getReminderEffectivenessStats(
          organizationId,
          effectivePeriod,
        ),
      ]);

    const autoMatchRate =
      autoMatch.totalCount === 0
        ? null
        : autoMatch.matchedCount / autoMatch.totalCount;
    const reminderEffectiveness =
      reminder.sentCount === 0
        ? null
        : reminder.paidWithin7dCount / reminder.sentCount;

    return {
      totalOutstanding: outstanding.totalOutstanding,
      totalOverdue: outstanding.totalOverdue,
      overdueRate:
        outstanding.totalOutstanding === 0
          ? 0
          : outstanding.totalOverdue / outstanding.totalOutstanding,
      cashForecast: forecast,
      topOverdueCustomers,
      autoMatchRate,
      manualHandlingRate: autoMatchRate === null ? null : 1 - autoMatchRate,
      reminderEffectiveness,
    };
  }
}
