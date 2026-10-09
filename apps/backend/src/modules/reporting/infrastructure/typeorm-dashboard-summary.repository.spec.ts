import type { DataSource } from 'typeorm';
import { TypeOrmDashboardSummaryRepository } from './typeorm-dashboard-summary.repository';

describe('TypeOrmDashboardSummaryRepository', () => {
  function buildRepository(rows: unknown[]) {
    const query = jest.fn().mockResolvedValue(rows);
    const repository = new TypeOrmDashboardSummaryRepository({
      query,
    } as never as DataSource);
    return { repository, query };
  }

  it('returns exact outstanding and overdue strings within the organization', async () => {
    const { repository, query } = buildRepository([
      {
        totalOutstanding: '9007199254740993',
        totalOverdue: '9007199254740992',
      },
    ]);

    await expect(repository.getOutstandingSummary('org-1')).resolves.toEqual({
      totalOutstanding: '9007199254740993',
      totalOverdue: '9007199254740992',
    });
    expect(query.mock.calls[0][0]).toContain('"organizationId" = $1');
    expect(query.mock.calls[0][0]).toContain('::text AS "totalOutstanding"');
    expect(query.mock.calls[0][0]).toContain('::text AS "totalOverdue"');
    expect(query.mock.calls[0][1]).toEqual(['org-1']);
  });

  it('returns exact forecast strings and preserves due-date filters', async () => {
    const { repository, query } = buildRepository([
      {
        forecast7d: '9007199254740993',
        forecast14d: '9007199254740994',
        forecast30d: '9007199254740995',
      },
    ]);

    await expect(repository.getForecast('org-1')).resolves.toEqual({
      forecast7d: '9007199254740993',
      forecast14d: '9007199254740994',
      forecast30d: '9007199254740995',
    });
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('"organizationId" = $1');
    expect(sql).toContain("INTERVAL '7 day'");
    expect(sql).toContain("INTERVAL '14 day'");
    expect(sql).toContain("INTERVAL '30 day'");
    expect(sql).toContain('::text AS "forecast7d"');
    expect(sql).toContain('::text AS "forecast14d"');
    expect(sql).toContain('::text AS "forecast30d"');
    expect(params).toEqual(['org-1']);
  });

  it('returns exact customer totals and orders by numeric sum with ownership filter', async () => {
    const { repository, query } = buildRepository([
      {
        customerId: 'customer-1',
        customerName: 'ACME',
        totalOverdue: '9007199254740993',
      },
    ]);

    await expect(
      repository.getTopOverdueCustomers('org-1', 'rep-1'),
    ).resolves.toEqual([
      {
        customerId: 'customer-1',
        customerName: 'ACME',
        totalOverdue: '9007199254740993',
      },
    ]);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('r."organizationId" = $1');
    expect(sql).toContain('c."organizationId" = $1');
    expect(sql).toContain('r."salesRepresentativeId" = $2');
    expect(sql).toContain('r."dueDate"::date < CURRENT_DATE');
    expect(sql).toContain('::text AS "totalOverdue"');
    expect(sql).toMatch(
      /ORDER BY\s+SUM\(r\."originalAmount" - r\."paidAmount"\) DESC/,
    );
    expect(params).toEqual(['org-1', 'rep-1']);
  });
});
