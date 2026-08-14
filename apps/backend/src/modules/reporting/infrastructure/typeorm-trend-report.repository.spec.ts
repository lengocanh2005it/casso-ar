import type { DataSource } from 'typeorm';
import type { ReportingMonth } from '../application/trend-report.repository.port';
import { TypeOrmTrendReportRepository } from './typeorm-trend-report.repository';

describe('TypeOrmTrendReportRepository', () => {
  function buildRepository(rows: unknown[] = []) {
    const queryMock = jest.fn().mockResolvedValue(rows);
    const dataSource = { query: queryMock } as never as DataSource;
    const repository = new TypeOrmTrendReportRepository(dataSource);
    return { repository, queryMock };
  }

  const months: ReportingMonth[] = [
    {
      key: '2026-06',
      start: new Date('2026-05-31T17:00:00.000Z'),
      end: new Date('2026-06-30T16:59:59.999Z'),
      endExclusive: new Date('2026-06-30T17:00:00.000Z'),
      isCurrent: false,
    },
    {
      key: '2026-07',
      start: new Date('2026-06-30T17:00:00.000Z'),
      end: new Date('2026-07-31T16:59:59.999Z'),
      endExclusive: new Date('2026-07-31T17:00:00.000Z'),
      isCurrent: false,
    },
  ];

  it('queries payments by receivedAt and organization without allocation sums', async () => {
    const { repository, queryMock } = buildRepository();

    await repository.findCollectedByMonths('org-1', months);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(params).toEqual([
      'org-1',
      new Date('2026-05-31T17:00:00.000Z'),
      new Date('2026-07-31T17:00:00.000Z'),
    ]);
    expect(sql).toContain('Asia/Ho_Chi_Minh');
    expect(sql).toContain('"receivedAt"');
    expect(sql).toContain('"receivedAt" < $3');
    expect(sql).toContain('"totalAmount"');
    expect(sql).not.toContain('payment_allocations');
  });

  it('maps PostgreSQL amount strings to integer numbers', async () => {
    const { repository } = buildRepository([
      { month: '2026-06', collected: '123000' },
    ]);

    await expect(
      repository.findCollectedByMonths('org-1', months),
    ).resolves.toEqual([{ month: '2026-06', collected: 123000 }]);
  });
});
