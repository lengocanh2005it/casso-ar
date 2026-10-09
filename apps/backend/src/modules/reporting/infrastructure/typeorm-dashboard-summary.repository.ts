import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type {
  AutoMatchStats,
  DashboardPeriod,
  ForecastSummary,
  IDashboardSummaryRepository,
  OutstandingSummary,
  ReminderEffectivenessStats,
  TopOverdueCustomer,
} from '../application/dashboard-summary.repository.port';

interface OutstandingSummaryRow {
  totalOutstanding: string | null;
  totalOverdue: string | null;
}

interface ForecastSummaryRow {
  forecast7d: string | null;
  forecast14d: string | null;
  forecast30d: string | null;
}

interface AutoMatchStatsRow {
  matchedCount: string;
  totalCount: string;
}

interface ReminderEffectivenessStatsRow {
  paidWithin7dCount: string;
  sentCount: string;
}

@Injectable()
export class TypeOrmDashboardSummaryRepository
  implements IDashboardSummaryRepository
{
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async getOutstandingSummary(
    organizationId: string,
  ): Promise<OutstandingSummary> {
    const [row]: OutstandingSummaryRow[] = await this.dataSource.query(
      `
        SELECT
          COALESCE(SUM("originalAmount" - "paidAmount"), 0)::text AS "totalOutstanding",
          COALESCE(
            SUM("originalAmount" - "paidAmount")
              FILTER (WHERE "dueDate"::date < CURRENT_DATE),
            0
          )::text AS "totalOverdue"
        FROM receivables
        WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')
      `,
      [organizationId],
    );

    return {
      totalOutstanding: row?.totalOutstanding ?? '0',
      totalOverdue: row?.totalOverdue ?? '0',
    };
  }

  async getForecast(organizationId: string): Promise<ForecastSummary> {
    const [row]: ForecastSummaryRow[] = await this.dataSource.query(
      `
        SELECT
          COALESCE(
            SUM("originalAmount" - "paidAmount")
              FILTER (WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 day'),
            0
          )::text AS "forecast7d",
          COALESCE(
            SUM("originalAmount" - "paidAmount")
              FILTER (WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '14 day'),
            0
          )::text AS "forecast14d",
          COALESCE(
            SUM("originalAmount" - "paidAmount")
              FILTER (WHERE "dueDate"::date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 day'),
            0
          )::text AS "forecast30d"
        FROM receivables
        WHERE "organizationId" = $1 AND status IN ('OPEN', 'PARTIALLY_PAID')
      `,
      [organizationId],
    );

    return {
      forecast7d: row?.forecast7d ?? '0',
      forecast14d: row?.forecast14d ?? '0',
      forecast30d: row?.forecast30d ?? '0',
    };
  }

  async getTopOverdueCustomers(
    organizationId: string,
    salesRepresentativeId?: string,
  ): Promise<TopOverdueCustomer[]> {
    const ownershipPredicate =
      salesRepresentativeId !== undefined
        ? `AND r."salesRepresentativeId" = $2
          AND r."originalAmount" > r."paidAmount"`
        : '';
    const params =
      salesRepresentativeId !== undefined
        ? [organizationId, salesRepresentativeId]
        : [organizationId];
    const rows: Array<{
      customerId: string;
      customerName: string;
      totalOverdue: string | null;
    }> = await this.dataSource.query(
      `
        SELECT
          r."customerId" AS "customerId",
          c.name AS "customerName",
          COALESCE(SUM(r."originalAmount" - r."paidAmount"), 0)::text AS "totalOverdue"
        FROM receivables r
        JOIN customers c
          ON c.id::text = r."customerId" AND c."organizationId" = $1
        WHERE r."organizationId" = $1
          AND r.status IN ('OPEN', 'PARTIALLY_PAID')
          AND r."dueDate"::date < CURRENT_DATE
          ${ownershipPredicate}
        GROUP BY r."customerId", c.name
        ORDER BY SUM(r."originalAmount" - r."paidAmount") DESC
        LIMIT 10
      `,
      params,
    );

    return rows.map((row) => ({
      customerId: row.customerId,
      customerName: row.customerName,
      totalOverdue: row.totalOverdue ?? '0',
    }));
  }

  async getAutoMatchStats(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<AutoMatchStats> {
    const [row]: AutoMatchStatsRow[] = await this.dataSource.query(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'MATCHED') AS "matchedCount",
          COUNT(*) AS "totalCount"
        FROM bank_transactions
        WHERE "organizationId" = $1 AND "createdAt" BETWEEN $2 AND $3
      `,
      [organizationId, period.from, period.to],
    );

    return {
      matchedCount: Number(row?.matchedCount ?? 0),
      totalCount: Number(row?.totalCount ?? 0),
    };
  }

  async getReminderEffectivenessStats(
    organizationId: string,
    period: DashboardPeriod,
  ): Promise<ReminderEffectivenessStats> {
    // Range scans on (organizationId, status, sentAt): the period window and
    // the global latest-sent-per-receivable group are both index-served,
    // replacing the old per-row correlated NOT EXISTS subquery.
    const [row]: ReminderEffectivenessStatsRow[] = await this.dataSource.query(
      `
          WITH period_sent AS (
            SELECT re."receivableId", re."sentAt"
            FROM reminder_executions re
            WHERE re."organizationId" = $1::uuid
              AND re.status = 'SENT'
              AND re."sentAt" BETWEEN $2 AND $3
          ),
          latest_sent AS (
            SELECT re."receivableId", MAX(re."sentAt") AS "sentAt"
            FROM reminder_executions re
            WHERE re."organizationId" = $1::uuid
              AND re.status = 'SENT'
            GROUP BY re."receivableId"
          )
          SELECT
            COUNT(*) FILTER (
              WHERE EXISTS (
                SELECT 1
                FROM latest_sent ls
                WHERE ls."receivableId" = ps."receivableId"
                  AND ls."sentAt" = ps."sentAt"
              )
              AND EXISTS (
                SELECT 1
                FROM receivables rec
                WHERE rec.id = ps."receivableId"
                  AND rec."organizationId" = $1::text
                  AND rec.status = 'PAID'
                  AND rec."closedAt" IS NOT NULL
                  AND rec."closedAt" >= ps."sentAt"
                  AND rec."closedAt" <= ps."sentAt" + INTERVAL '7 day'
              )
            ) AS "paidWithin7dCount",
            COUNT(*) AS "sentCount"
          FROM period_sent ps
        `,
      [organizationId, period.from, period.to],
    );

    return {
      paidWithin7dCount: Number(row?.paidWithin7dCount ?? 0),
      sentCount: Number(row?.sentCount ?? 0),
    };
  }
}
