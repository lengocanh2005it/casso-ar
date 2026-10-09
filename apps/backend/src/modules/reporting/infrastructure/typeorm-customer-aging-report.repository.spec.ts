import type { DataSource } from 'typeorm';
import type { CustomerAgingPage } from '../application/customer-aging-report.repository.port';
import { TypeOrmCustomerAgingReportRepository } from './typeorm-customer-aging-report.repository';

describe('TypeOrmCustomerAgingReportRepository', () => {
  function buildRepository(rows: unknown[] = []) {
    const queryMock = jest.fn().mockResolvedValue(rows);
    const dataSource = { query: queryMock } as never as DataSource;
    const repository = new TypeOrmCustomerAgingReportRepository(dataSource);
    return { repository, dataSource, queryMock };
  }

  it('passes organization, search, bucket, limit, and offset as parameters', async () => {
    const { repository, queryMock } = buildRepository([{ totalCount: '0' }]);

    await repository.findPage('org-1', {
      page: 2,
      limit: 20,
      search: 'ACME',
      bucket: 'OVERDUE_60_PLUS',
    });

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as unknown as [
      string,
      string[],
    ];
    expect(params).toEqual(['org-1', '%ACME%', 'OVERDUE_60_PLUS', 20, 20]);
    expect(sql).toContain('LIMIT $4');
    expect(sql).toContain('OFFSET $5');
    expect(sql).toContain('),\n\n  grouped AS (');
    expect(sql).toContain('WHERE CASE $3');
    expect(sql).toContain('WHEN \'OVERDUE_60_PLUS\' THEN "overdue60Plus"');
    expect(sql).toContain('"totalRemaining"::text AS "totalRemaining"');
    expect(sql).toContain('ORDER BY grouped."totalRemaining" DESC');
  });

  it('omits search and bucket parameters when not provided', async () => {
    const { repository, queryMock } = buildRepository();

    await repository.findPage('org-1', { page: 1, limit: 20 });

    const [, params] = queryMock.mock.calls[0] as unknown as [string, string[]];
    expect(params).toEqual(['org-1', 20, 0]);
  });

  it('maps exact decimal strings and zero-fills all five buckets', async () => {
    const { repository } = buildRepository([
      {
        customerId: 'cust-1',
        customerName: 'ACME Corp',
        taxCode: '0101234567',
        notDue: '900',
        overdue1To7: '1500',
        overdue8To30: '2000',
        overdue31To60: '3000',
        overdue60Plus: '4000',
        totalRemaining: '11400',
        totalCount: '1',
      },
    ]);

    await expect(
      repository.findPage('org-1', { page: 1, limit: 20 }),
    ).resolves.toEqual<CustomerAgingPage>({
      items: [
        {
          customerId: 'cust-1',
          customerName: 'ACME Corp',
          taxCode: '0101234567',
          buckets: [
            { bucket: 'NOT_DUE', totalRemaining: '900' },
            { bucket: 'OVERDUE_1_7', totalRemaining: '1500' },
            { bucket: 'OVERDUE_8_30', totalRemaining: '2000' },
            { bucket: 'OVERDUE_31_60', totalRemaining: '3000' },
            { bucket: 'OVERDUE_60_PLUS', totalRemaining: '4000' },
          ],
          totalRemaining: '11400',
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('preserves aggregate values above JavaScript safe integer precision', async () => {
    const { repository } = buildRepository([
      {
        customerId: 'cust-1',
        customerName: 'ACME Corp',
        taxCode: '0101234567',
        notDue: '9007199254740993',
        overdue1To7: '0',
        overdue8To30: '0',
        overdue31To60: '0',
        overdue60Plus: '0',
        totalRemaining: '9007199254740993',
        totalCount: '1',
      },
    ]);

    const page = await repository.findPage('org-1', { page: 1, limit: 20 });

    expect(page.items[0]?.buckets[0]?.totalRemaining).toBe('9007199254740993');
    expect(page.items[0]?.totalRemaining).toBe('9007199254740993');
  });

  it('zero-fills buckets missing from a pivot row', async () => {
    const { repository } = buildRepository([
      {
        customerId: 'cust-1',
        customerName: 'ACME Corp',
        taxCode: '0101234567',
        notDue: '0',
        overdue1To7: '0',
        overdue8To30: '0',
        overdue31To60: '0',
        overdue60Plus: '0',
        totalRemaining: '0',
        totalCount: '1',
      },
    ]);

    const page = await repository.findPage('org-1', { page: 1, limit: 20 });

    expect(
      page.items[0]?.buckets.every((bucket) => bucket.totalRemaining === '0'),
    ).toBe(true);
  });

  it('returns the window count as the page total', async () => {
    const { repository } = buildRepository([
      {
        customerId: 'cust-1',
        customerName: 'ACME Corp',
        taxCode: '0101234567',
        notDue: '0',
        overdue1To7: '0',
        overdue8To30: '0',
        overdue31To60: '0',
        overdue60Plus: '0',
        totalRemaining: '0',
        totalCount: '42',
      },
    ]);

    const page = await repository.findPage('org-1', { page: 1, limit: 20 });

    expect(page.total).toBe(42);
  });
});
