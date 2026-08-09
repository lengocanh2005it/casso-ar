import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  AgingBucket,
  AgingBucketCount,
  IAgingReportRepository,
} from '../application/aging-report.repository.port';

interface AgingBucketRow {
  bucket: AgingBucket;
  count: string;
  totalRemaining: string | null;
}

const AGING_BUCKETS_SQL = `
  SELECT
    CASE
      WHEN "dueDate"::date >= CURRENT_DATE THEN 'NOT_DUE'
      WHEN CURRENT_DATE - "dueDate"::date BETWEEN 1 AND 7 THEN 'OVERDUE_1_7'
      WHEN CURRENT_DATE - "dueDate"::date BETWEEN 8 AND 30 THEN 'OVERDUE_8_30'
      WHEN CURRENT_DATE - "dueDate"::date BETWEEN 31 AND 60 THEN 'OVERDUE_31_60'
      ELSE 'OVERDUE_60_PLUS'
    END AS bucket,
    COUNT(*) AS count,
    COALESCE(SUM("originalAmount" - "paidAmount"), 0) AS "totalRemaining"
  FROM receivables
  WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')
  GROUP BY bucket
`;

@Injectable()
export class TypeOrmAgingReportRepository implements IAgingReportRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findBucketCounts(organizationId: string): Promise<AgingBucketCount[]> {
    const rows: AgingBucketRow[] = await this.dataSource.query(
      AGING_BUCKETS_SQL,
      [organizationId],
    );

    return rows.map((row) => ({
      bucket: row.bucket,
      count: Number(row.count),
      totalRemaining: Number(row.totalRemaining ?? 0),
    }));
  }
}
