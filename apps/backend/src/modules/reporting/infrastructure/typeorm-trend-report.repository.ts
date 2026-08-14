import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  CollectedPoint,
  ITrendReportRepository,
  ReportingMonth,
} from '../application/trend-report.repository.port';

interface CollectedRow {
  month: string;
  collected: string | null;
}

const REPORTING_TIMEZONE = 'Asia/Ho_Chi_Minh';

const COLLECTED_BY_MONTH_SQL = `
  SELECT
    to_char("receivedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh', 'YYYY-MM') AS month,
    COALESCE(SUM("totalAmount"), 0) AS collected
  FROM payments
  WHERE "organizationId" = $1
    AND "receivedAt" >= $2
    AND "receivedAt" <= $3
  GROUP BY month
`;

@Injectable()
export class TypeOrmTrendReportRepository implements ITrendReportRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findCollectedByMonths(
    organizationId: string,
    months: ReportingMonth[],
  ): Promise<CollectedPoint[]> {
    const first = months[0];
    const last = months[months.length - 1];
    if (!first || !last) return [];

    const rows = await this.dataSource.query<CollectedRow[]>(
      COLLECTED_BY_MONTH_SQL,
      [organizationId, first.start, last.end],
    );

    return rows.map((row) => ({
      month: row.month,
      collected: Number(row.collected ?? 0),
    }));
  }
}
