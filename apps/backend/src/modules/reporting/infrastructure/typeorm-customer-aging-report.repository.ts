import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { toLikePattern } from '../../../common/database/like-pattern';
import {
  AGING_BUCKETS,
  type AgingBucket,
} from '../application/aging-report.repository.port';
import type {
  CustomerAgingFilters,
  CustomerAgingPage,
  ICustomerAgingReportRepository,
} from '../application/customer-aging-report.repository.port';

const PIVOT_COLUMN: Record<AgingBucket, keyof CustomerAgingPivotRow> = {
  NOT_DUE: 'notDue',
  OVERDUE_1_7: 'overdue1To7',
  OVERDUE_8_30: 'overdue8To30',
  OVERDUE_31_60: 'overdue31To60',
  OVERDUE_60_PLUS: 'overdue60Plus',
};

interface CustomerAgingPivotRow {
  customerId: string;
  customerName: string;
  taxCode: string;
  notDue: string;
  overdue1To7: string;
  overdue8To30: string;
  overdue31To60: string;
  overdue60Plus: string;
  totalRemaining: string;
  totalCount: string;
}

const ACTIVE_RECEIVABLES_CTE = `
  active_receivables AS (
    SELECT
      r."customerId",
      c.name AS "customerName",
      c."taxCode",
      r."originalAmount" - r."paidAmount" AS remaining,
      CASE
        WHEN r."dueDate"::date >= CURRENT_DATE THEN 'NOT_DUE'
        WHEN CURRENT_DATE - r."dueDate"::date BETWEEN 1 AND 7 THEN 'OVERDUE_1_7'
        WHEN CURRENT_DATE - r."dueDate"::date BETWEEN 8 AND 30 THEN 'OVERDUE_8_30'
        WHEN CURRENT_DATE - r."dueDate"::date BETWEEN 31 AND 60 THEN 'OVERDUE_31_60'
        ELSE 'OVERDUE_60_PLUS'
      END AS bucket
    FROM receivables r
    INNER JOIN customers c
      ON c.id::text = r."customerId"
      AND c."organizationId" = r."organizationId"
    WHERE r."organizationId" = $1
      AND r.status IN ('OPEN', 'PARTIALLY_PAID')
      AND r."originalAmount" - r."paidAmount" > 0`;

const GROUPED_CTE = `
  grouped AS (
    SELECT
      "customerId",
      "customerName",
      "taxCode",
      COALESCE(SUM(remaining) FILTER (WHERE bucket = 'NOT_DUE'), 0) AS "notDue",
      COALESCE(SUM(remaining) FILTER (WHERE bucket = 'OVERDUE_1_7'), 0) AS "overdue1To7",
      COALESCE(SUM(remaining) FILTER (WHERE bucket = 'OVERDUE_8_30'), 0) AS "overdue8To30",
      COALESCE(SUM(remaining) FILTER (WHERE bucket = 'OVERDUE_31_60'), 0) AS "overdue31To60",
      COALESCE(SUM(remaining) FILTER (WHERE bucket = 'OVERDUE_60_PLUS'), 0) AS "overdue60Plus",
      SUM(remaining) AS "totalRemaining"
    FROM active_receivables
    GROUP BY "customerId", "customerName", "taxCode"
  )`;

const SELECT_PIVOT = `
  SELECT
    "customerId",
    "customerName",
    "taxCode",
    "notDue"::text AS "notDue",
    "overdue1To7"::text AS "overdue1To7",
    "overdue8To30"::text AS "overdue8To30",
    "overdue31To60"::text AS "overdue31To60",
    "overdue60Plus"::text AS "overdue60Plus",
    "totalRemaining"::text AS "totalRemaining",
    COUNT(*) OVER () AS "totalCount"
  FROM grouped`;

@Injectable()
export class TypeOrmCustomerAgingReportRepository
  implements ICustomerAgingReportRepository
{
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findPage(
    organizationId: string,
    filters: CustomerAgingFilters,
    salesRepresentativeId?: string,
  ): Promise<CustomerAgingPage> {
    const params: unknown[] = [organizationId];

    let ownershipPredicate = '';
    if (salesRepresentativeId !== undefined) {
      params.push(salesRepresentativeId);
      ownershipPredicate = `
      AND r."salesRepresentativeId" = $${params.length}`;
    }

    let searchPredicate = '';
    if (filters.search) {
      params.push(toLikePattern(filters.search));
      const searchIndex = params.length;
      searchPredicate = `
        AND (c.name ILIKE $${searchIndex} OR c."taxCode" ILIKE $${searchIndex} OR c.phone ILIKE $${searchIndex})`;
    }

    let bucketPredicate = '';
    if (filters.bucket) {
      params.push(filters.bucket);
      const bucketIndex = params.length;
      bucketPredicate = `
        WHERE CASE $${bucketIndex}
          WHEN 'NOT_DUE' THEN "notDue"
          WHEN 'OVERDUE_1_7' THEN "overdue1To7"
          WHEN 'OVERDUE_8_30' THEN "overdue8To30"
          WHEN 'OVERDUE_31_60' THEN "overdue31To60"
          WHEN 'OVERDUE_60_PLUS' THEN "overdue60Plus"
        END > 0`;
    }

    const countParams = [...params];
    params.push(filters.limit, (filters.page - 1) * filters.limit);
    const limitIndex = params.length - 1;

    const baseSql = `WITH ${ACTIVE_RECEIVABLES_CTE}${ownershipPredicate}${searchPredicate}),
${GROUPED_CTE}`;
    const sql = `${baseSql}
${SELECT_PIVOT}
${bucketPredicate}
ORDER BY grouped."totalRemaining" DESC, "customerName" ASC, "customerId" ASC
LIMIT $${limitIndex} OFFSET $${limitIndex + 1}`;

    const rows = await this.dataSource.query<CustomerAgingPivotRow[]>(
      sql,
      params,
    );

    const items = rows.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      taxCode: row.taxCode,
      buckets: AGING_BUCKETS.map((bucket) => ({
        bucket,
        totalRemaining: row[PIVOT_COLUMN[bucket]] ?? '0',
      })),
      totalRemaining: row.totalRemaining ?? '0',
    }));

    let total = rows.length > 0 ? Number(rows[0]?.totalCount ?? 0) : 0;
    if (rows.length === 0) {
      const countRows = await this.dataSource.query<{ totalCount: string }[]>(
        `${baseSql}
SELECT COUNT(*) AS "totalCount"
FROM grouped
${bucketPredicate}`,
        countParams,
      );
      total = Number(countRows[0]?.totalCount ?? 0);
    }

    return {
      items,
      total,
      page: filters.page,
      limit: filters.limit,
    };
  }
}
