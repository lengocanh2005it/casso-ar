import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { formatInTimeZone } from 'date-fns-tz';
import { DataSource } from 'typeorm';
import { AppError } from '../../../common/errors/app-error';
import { ErrorCode } from '../../../common/errors/error-code';
import { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  HistoricalOutstandingPoint,
  IReceivableBalanceHistoryQuery,
  ReceivableBalanceHistoryDailyPoint,
  ReceivableBalanceHistoryListFilters,
  ReceivableBalanceHistoryListItem,
  ReceivableBalanceHistoryListPage,
  ReceivableBalanceHistorySourcePoint,
  ReceivableBalanceHistorySummary,
} from '../application/receivable-balance-history-query.port';

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';

interface OutstandingRow {
  month: string;
  outstanding: string | null;
}

interface ListRow {
  id: string;
  sequence: string;
  receivableId: string;
  invoiceNumber: string | null;
  customerId: string;
  customerName: string | null;
  status: string;
  remainingAmount: string;
  effectiveAt: Date;
  changeSource: string;
  reasonCode: string | null;
  actorType: string | null;
  actorDisplayName: string | null;
  transitionReferenceId: string | null;
  note: string | null;
}

interface CountRow {
  total: string;
}

interface SummaryRow {
  totalTransitions: string;
  affectedReceivables: string;
  latestRemainingAmount: string | null;
}

interface DailyRow {
  date: string;
  transitions: string;
}

interface SourceRow {
  changeSource: string;
  count: string;
}

const MONTH_END_OUTSTANDING_SQL = `
  WITH requested_months AS (
    SELECT
      t.month_end,
      to_char(t.month_end AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS month_key
    FROM unnest($2::timestamptz[]) AS t(month_end)
  ),
  coverage_epochs AS (
    SELECT "organizationId", MIN("coveredFrom") AS covered_from
    FROM receivable_balance_history_coverage
    WHERE "organizationId" = $1
    GROUP BY "organizationId"
  ),
  latest_per_receivable AS (
    SELECT DISTINCT ON (h."receivableId", m.month_key)
      m.month_key,
      h.status,
      h."remainingAmount"
    FROM requested_months m
    JOIN coverage_epochs c ON true
    JOIN receivable_balance_history h
          ON h."organizationId" = c."organizationId"
          AND h."effectiveAt" >= c.covered_from
          AND h."effectiveAt" < m.month_end + INTERVAL '1 millisecond'
    ORDER BY h."receivableId", m.month_key, h."effectiveAt" DESC, h.sequence DESC
  ),
  covered_months AS (
    SELECT DISTINCT m.month_key
    FROM requested_months m
    JOIN coverage_epochs c
      ON c.covered_from < m.month_end + INTERVAL '1 millisecond'
  )
  SELECT
    m.month_key AS month,
    CASE
      WHEN cm.month_key IS NULL THEN NULL
      ELSE COALESCE(
        SUM(lp."remainingAmount")
          FILTER (WHERE lp.status IN ('OPEN', 'PARTIALLY_PAID')),
        0
      )
    END AS outstanding
  FROM requested_months m
  LEFT JOIN covered_months cm ON cm.month_key = m.month_key
  LEFT JOIN latest_per_receivable lp ON lp.month_key = m.month_key
  GROUP BY m.month_key, m.month_end, cm.month_key
  ORDER BY m.month_end
`;

// The predicate block is shared verbatim by the list, count, and summary
// statements; parameter positions are identical ($1 organizationId, then one
// optional filter each). Never select actor email, payment, or allocation
// columns — the audit view exposes only display-safe data.
const FILTER_PREDICATES = `
  h."organizationId" = $1
  AND ($2::uuid IS NULL OR h."receivableId" = $2)
  AND ($3::timestamptz IS NULL OR h."effectiveAt" >= $3)
  AND ($4::timestamptz IS NULL OR h."effectiveAt" <= $4)
  AND ($5::text IS NULL OR h.status::text = $5)
  AND ($6::text IS NULL OR h."changeSource" = $6)
  AND ($7::text IS NULL OR h."actorType" = $7)
`;

const LIST_SQL = `
  SELECT
    h.id,
    h.sequence,
    h."receivableId",
    i."invoiceNumber",
    r."customerId",
    c.name AS "customerName",
    h.status,
    h."remainingAmount",
    h."effectiveAt",
    h."changeSource",
    h."reasonCode",
    h."actorType",
    u.name AS "actorDisplayName",
    h."transitionReferenceId",
    h.note
  FROM receivable_balance_history h
  JOIN receivables r
    ON r.id = h."receivableId"
    AND r."organizationId" = h."organizationId"
  LEFT JOIN invoices i
    ON i.id = r."invoiceId"
    AND i."organizationId" = r."organizationId"
  LEFT JOIN customers c
    ON c.id = r."customerId"
    AND c."organizationId" = r."organizationId"
  LEFT JOIN users u ON u.id = h."actorUserId"
  WHERE ${FILTER_PREDICATES}
  ORDER BY h."effectiveAt" DESC, h.sequence DESC
  LIMIT $8 OFFSET $9
`;

const COUNT_SQL = `
  SELECT COUNT(*)::text AS total
  FROM receivable_balance_history h
  WHERE ${FILTER_PREDICATES}
`;

const SUMMARY_SQL = `
  WITH filtered AS (
    SELECT h."receivableId", h.status, h."remainingAmount", h."effectiveAt", h.sequence
    FROM receivable_balance_history h
    WHERE ${FILTER_PREDICATES}
  ),
  latest_per_receivable AS (
    SELECT DISTINCT ON (f."receivableId")
      f."receivableId",
      f."remainingAmount"
    FROM filtered f
    ORDER BY f."receivableId", f."effectiveAt" DESC, f.sequence DESC
  )
  SELECT
    (SELECT COUNT(*)::text FROM filtered) AS "totalTransitions",
    (SELECT COUNT(*)::text FROM (SELECT DISTINCT "receivableId" FROM filtered) d)
      AS "affectedReceivables",
    (SELECT COALESCE(SUM("remainingAmount"), 0)::text FROM latest_per_receivable)
      AS "latestRemainingAmount"
`;

const DAILY_SERIES_SQL = `
  SELECT
    to_char(h."effectiveAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM-DD') AS date,
    COUNT(*)::text AS transitions
  FROM receivable_balance_history h
  WHERE ${FILTER_PREDICATES}
  GROUP BY 1
  ORDER BY 1
`;

const SOURCE_DISTRIBUTION_SQL = `
  SELECT h."changeSource", COUNT(*)::text AS count
  FROM receivable_balance_history h
  WHERE ${FILTER_PREDICATES}
  GROUP BY h."changeSource"
  ORDER BY count DESC, h."changeSource"
`;

@Injectable()
export class TypeOrmReceivableBalanceHistoryQuery
  implements IReceivableBalanceHistoryQuery
{
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContextService,
  ) {}

  async findOutstandingByMonthEnds(
    organizationId: string,
    monthEnds: Date[],
  ): Promise<HistoricalOutstandingPoint[]> {
    this.assertTenant(organizationId);
    const rows = await this.dataSource.query<OutstandingRow[]>(
      MONTH_END_OUTSTANDING_SQL,
      [organizationId, monthEnds.map((date) => date.toISOString())],
    );
    return rows.map((row) => ({
      month: row.month,
      outstanding: row.outstanding === null ? null : Number(row.outstanding),
    }));
  }

  async list(
    organizationId: string,
    filters: ReceivableBalanceHistoryListFilters,
    page: number,
    limit: number,
  ): Promise<ReceivableBalanceHistoryListPage> {
    this.assertTenant(organizationId);
    const params = this.buildFilterParams(organizationId, filters);
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      this.dataSource.query<ListRow[]>(LIST_SQL, [...params, limit, offset]),
      this.dataSource.query<CountRow[]>(COUNT_SQL, params),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        sequence: Number(row.sequence),
        receivableId: row.receivableId,
        invoiceNumber: row.invoiceNumber,
        customerId: row.customerId,
        customerName: row.customerName,
        status: row.status as ReceivableBalanceHistoryListItem['status'],
        remainingAmount: Number(row.remainingAmount),
        effectiveAt: new Date(String(row.effectiveAt)),
        changeSource:
          row.changeSource as ReceivableBalanceHistoryListItem['changeSource'],
        reasonCode:
          row.reasonCode as ReceivableBalanceHistoryListItem['reasonCode'],
        actorType:
          row.actorType as ReceivableBalanceHistoryListItem['actorType'],
        actorDisplayName: row.actorDisplayName,
        transitionReferenceId: row.transitionReferenceId,
        note: row.note,
      })),
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async summarize(
    organizationId: string,
    filters: ReceivableBalanceHistoryListFilters,
  ): Promise<ReceivableBalanceHistorySummary> {
    this.assertTenant(organizationId);
    const params = this.buildFilterParams(organizationId, filters);

    const [summaryRows, dailyRows, sourceRows] = await Promise.all([
      this.dataSource.query<SummaryRow[]>(SUMMARY_SQL, params),
      this.dataSource.query<DailyRow[]>(DAILY_SERIES_SQL, params),
      this.dataSource.query<SourceRow[]>(SOURCE_DISTRIBUTION_SQL, params),
    ]);

    return {
      totalTransitions: Number(summaryRows[0]?.totalTransitions ?? 0),
      affectedReceivables: Number(summaryRows[0]?.affectedReceivables ?? 0),
      latestRemainingAmount: Number(summaryRows[0]?.latestRemainingAmount ?? 0),
      dailySeries: this.fillDailySeries(dailyRows, filters),
      sourceDistribution: sourceRows.map((row) => ({
        changeSource:
          row.changeSource as ReceivableBalanceHistorySourcePoint['changeSource'],
        count: Number(row.count),
      })),
    };
  }

  private assertTenant(organizationId: string): void {
    if (this.tenantContext.getOrganizationId() !== organizationId) {
      throw new AppError(
        ErrorCode.TENANT_MISMATCH,
        'Không thể truy cập dữ liệu của tổ chức khác',
      );
    }
  }

  private buildFilterParams(
    organizationId: string,
    filters: ReceivableBalanceHistoryListFilters,
  ): unknown[] {
    return [
      organizationId,
      filters.receivableId ?? null,
      filters.from ? filters.from.toISOString() : null,
      filters.to ? filters.to.toISOString() : null,
      filters.status ?? null,
      filters.changeSource ?? null,
      filters.actorType ?? null,
    ];
  }

  private fillDailySeries(
    rows: DailyRow[],
    filters: ReceivableBalanceHistoryListFilters,
  ): ReceivableBalanceHistoryDailyPoint[] {
    const byDate = new Map(
      rows.map((row) => [row.date, Number(row.transitions)]),
    );
    let start: string | null = filters.from
      ? formatInTimeZone(filters.from, REPORTING_TIMEZONE, 'yyyy-MM-dd')
      : null;
    let end: string | null = filters.to
      ? formatInTimeZone(filters.to, REPORTING_TIMEZONE, 'yyyy-MM-dd')
      : null;
    if (!start && rows.length > 0) start = rows[0].date;
    if (!end && rows.length > 0) end = rows[rows.length - 1].date;
    if (!start || !end) return [];

    // Noon UTC is always the same calendar date in Asia/Ho_Chi_Minh (UTC+7),
    // so day-stepping on UTC keeps the local-day keys exact.
    const series: ReceivableBalanceHistoryDailyPoint[] = [];
    const cursor = new Date(`${start}T12:00:00.000Z`);
    const endInstant = new Date(`${end}T12:00:00.000Z`);
    while (cursor <= endInstant) {
      const key = formatInTimeZone(cursor, REPORTING_TIMEZONE, 'yyyy-MM-dd');
      series.push({ date: key, transitions: byDate.get(key) ?? 0 });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return series;
  }
}
