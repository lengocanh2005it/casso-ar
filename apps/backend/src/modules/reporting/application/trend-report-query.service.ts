import { Inject, Injectable } from '@nestjs/common';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import {
  type IReceivableBalanceHistoryQuery,
  RECEIVABLE_BALANCE_HISTORY_QUERY,
} from '../../receivable-balance-history/application/receivable-balance-history-query.port';
import {
  type ITrendReportRepository,
  type ReportingMonth,
  type ReportsTrendPoint,
  TREND_REPORT_REPOSITORY,
  type TrendMonths,
} from './trend-report.repository.port';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';

function padMonth(month: number): string {
  return String(month).padStart(2, '0');
}

// Last representable JavaScript millisecond of the given calendar month in
// Asia/Ho_Chi_Minh. Queries use endExclusive to retain PostgreSQL precision.
function monthEndInTimeZone(year: number, month: number): Date {
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const startOfNextMonth = fromZonedTime(
    `${nextYear}-${padMonth(nextMonth)}-01T00:00:00`,
    REPORTING_TIMEZONE,
  );
  return new Date(startOfNextMonth.getTime() - 1);
}

export function buildTrendMonthWindows(
  months: TrendMonths,
  now: Date,
): ReportingMonth[] {
  const currentKey = formatInTimeZone(now, REPORTING_TIMEZONE, 'yyyy-MM');
  const [currentYear, currentMonth] = currentKey.split('-').map(Number);
  const currentIndex = currentYear * 12 + (currentMonth - 1);

  const windows: ReportingMonth[] = [];
  for (let offset = months - 1; offset >= 0; offset--) {
    const index = currentIndex - offset;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const key = `${year}-${padMonth(month)}`;
    const isCurrent = offset === 0;
    const start = fromZonedTime(`${key}-01T00:00:00`, REPORTING_TIMEZONE);
    const end = isCurrent ? now : monthEndInTimeZone(year, month);

    windows.push({
      key,
      start,
      end,
      endExclusive: new Date(end.getTime() + 1),
      isCurrent,
    });
  }
  return windows;
}

@Injectable()
export class TrendReportQueryService {
  constructor(
    @Inject(TREND_REPORT_REPOSITORY)
    private readonly trendRepo: ITrendReportRepository,
    @Inject(RECEIVABLE_BALANCE_HISTORY_QUERY)
    private readonly historyQuery: IReceivableBalanceHistoryQuery,
    private readonly tenantContext: TenantContextService,
  ) {}

  async getTrend(
    months: TrendMonths = 12,
  ): Promise<{ months: TrendMonths; items: ReportsTrendPoint[] }> {
    const organizationId = this.tenantContext.getOrganizationId();
    const windows = buildTrendMonthWindows(months, new Date());

    const [collectedPoints, outstandingPoints] = await Promise.all([
      this.trendRepo.findCollectedByMonths(organizationId, windows),
      this.historyQuery.findOutstandingByMonthEnds(
        organizationId,
        windows.map((window) => window.end),
      ),
    ]);

    const collectedByMonth = new Map(
      collectedPoints.map((point) => [point.month, point.collected]),
    );
    const outstandingByMonth = new Map(
      outstandingPoints.map((point) => [point.month, point.outstanding]),
    );

    const items = windows.map((window) => ({
      month: window.key,
      // Preserve the query layer's null ("no history yet — unknown", e.g.
      // months before the org's first receivable) distinct from a real 0
      // ("history exists and the balance was zero"). Only a genuinely
      // missing map entry (shouldn't happen — every window is queried)
      // falls back to null too, never a silent 0.
      outstanding: outstandingByMonth.get(window.key) ?? null,
      collected: collectedByMonth.get(window.key) ?? 0,
    }));

    return { months, items };
  }
}
