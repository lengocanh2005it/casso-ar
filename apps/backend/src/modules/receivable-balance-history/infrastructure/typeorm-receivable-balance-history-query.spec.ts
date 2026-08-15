import type { DataSource } from 'typeorm';
import { ErrorCode } from '../../../common/errors/error-code';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import { TypeOrmReceivableBalanceHistoryQuery } from './typeorm-receivable-balance-history-query';

describe('TypeOrmReceivableBalanceHistoryQuery', () => {
  function buildQuery(rows: unknown[] = [], tenantId = 'org-1') {
    const queryMock = jest.fn().mockResolvedValue(rows);
    const dataSource = { query: queryMock } as never as DataSource;
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue(tenantId),
    } as never as TenantContextService;
    const queryService = new TypeOrmReceivableBalanceHistoryQuery(
      dataSource,
      tenantContext,
    );
    return { queryService, queryMock };
  }

  it('rejects a cross-tenant query before touching the database', async () => {
    const { queryService, queryMock } = buildQuery([], 'org-2');

    await expect(
      queryService.findOutstandingByMonthEnds('org-1', []),
    ).rejects.toMatchObject({ errorCode: ErrorCode.TENANT_MISMATCH });

    expect(queryMock).not.toHaveBeenCalled();
  });

  it('passes the organization and month-end instants as parameters', async () => {
    const { queryService, queryMock } = buildQuery();
    const firstMonthEnd = new Date('2026-07-31T17:00:00.000Z');
    const secondMonthEnd = new Date('2026-08-31T17:00:00.000Z');

    await queryService.findOutstandingByMonthEnds('org-1', [
      firstMonthEnd,
      secondMonthEnd,
    ]);

    expect(queryMock).toHaveBeenCalledTimes(1);
    const [sql, params] = queryMock.mock.calls[0] as unknown as [
      string,
      unknown[],
    ];
    expect(params).toEqual([
      'org-1',
      ['2026-07-31T17:00:00.000Z', '2026-08-31T17:00:00.000Z'],
    ]);
    expect(sql).toContain('Asia/Ho_Chi_Minh');
    expect(sql).toContain(
      '"effectiveAt" < m.month_end + INTERVAL \'1 millisecond\'',
    );
    expect(sql).not.toContain('payment_allocations');
  });

  it('only considers history at or after the organization coverage epoch', async () => {
    const { queryService, queryMock } = buildQuery();

    await queryService.findOutstandingByMonthEnds('org-1', [
      new Date('2026-07-31T17:00:00.000Z'),
    ]);

    const [sql] = queryMock.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('receivable_balance_history_coverage');
    expect(sql).toContain('coveredFrom');
    expect(sql).toContain('h."effectiveAt" >= c.covered_from');
  });

  it('maps bigint outstanding to numbers and keeps null for uncovered months', async () => {
    const { queryService } = buildQuery([
      { month: '2026-06', outstanding: null },
      { month: '2026-07', outstanding: '123000' },
    ]);

    await expect(
      queryService.findOutstandingByMonthEnds('org-1', [
        new Date('2026-06-30T17:00:00.000Z'),
        new Date('2026-07-31T17:00:00.000Z'),
      ]),
    ).resolves.toEqual([
      { month: '2026-06', outstanding: null },
      { month: '2026-07', outstanding: 123000 },
    ]);
  });

  it('returns every requested month in the order the rows were returned', async () => {
    const { queryService } = buildQuery([
      { month: '2026-09', outstanding: '0' },
      { month: '2026-08', outstanding: '500' },
      { month: '2026-07', outstanding: '1000' },
    ]);

    const result = await queryService.findOutstandingByMonthEnds('org-1', [
      new Date('2026-07-31T17:00:00.000Z'),
      new Date('2026-08-31T17:00:00.000Z'),
      new Date('2026-09-30T17:00:00.000Z'),
    ]);

    expect(result.map((point) => point.month)).toEqual([
      '2026-09',
      '2026-08',
      '2026-07',
    ]);
  });
});
