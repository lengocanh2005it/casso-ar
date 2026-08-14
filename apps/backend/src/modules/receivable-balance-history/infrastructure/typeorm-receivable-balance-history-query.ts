import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  HistoricalOutstandingPoint,
  IReceivableBalanceHistoryQuery,
} from '../application/receivable-balance-history-query.port';

interface OutstandingRow {
  month: string;
  outstanding: string | null;
}

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';

const MONTH_END_OUTSTANDING_SQL = `
  WITH requested_months AS (
    SELECT
      t.month_end,
      to_char(t.month_end AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS month_key
    FROM unnest($2::timestamptz[]) AS t(month_end)
  ),
  latest_per_receivable AS (
    SELECT DISTINCT ON (h."receivableId", m.month_key)
      m.month_key,
      h.status,
      h."remainingAmount"
    FROM requested_months m
    JOIN receivable_balance_history h
      ON h."organizationId" = $1 AND h."effectiveAt" <= m.month_end
    ORDER BY h."receivableId", m.month_key, h."effectiveAt" DESC, h.sequence DESC
  ),
  covered_months AS (
    SELECT DISTINCT m.month_key
    FROM requested_months m
    WHERE EXISTS (
      SELECT 1
      FROM receivable_balance_history h
      WHERE h."organizationId" = $1 AND h."effectiveAt" <= m.month_end
    )
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

@Injectable()
export class TypeOrmReceivableBalanceHistoryQuery
  implements IReceivableBalanceHistoryQuery
{
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findOutstandingByMonthEnds(
    organizationId: string,
    monthEnds: Date[],
  ): Promise<HistoricalOutstandingPoint[]> {
    const rows = await this.dataSource.query<OutstandingRow[]>(
      MONTH_END_OUTSTANDING_SQL,
      [organizationId, monthEnds.map((date) => date.toISOString())],
    );

    return rows.map((row) => ({
      month: row.month,
      outstanding: row.outstanding === null ? null : Number(row.outstanding),
    }));
  }
}
