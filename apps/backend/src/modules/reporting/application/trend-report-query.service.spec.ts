import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type { IReceivableBalanceHistoryQuery } from '../../receivable-balance-history/application/receivable-balance-history-query.port';
import type {
  ITrendReportRepository,
  ReportingMonth,
  ReportsTrendPoint,
} from './trend-report.repository.port';
import { TrendReportQueryService } from './trend-report-query.service';

describe('TrendReportQueryService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-14T09:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  function buildService(
    historyRows: unknown[] = [],
    collectedRows: unknown[] = [],
  ) {
    const findCollectedMock = jest.fn().mockResolvedValue(collectedRows);
    const trendRepo = {
      findCollectedByMonths: findCollectedMock,
    } as never as ITrendReportRepository;
    const findOutstandingMock = jest.fn().mockResolvedValue(historyRows);
    const historyQuery = {
      findOutstandingByMonthEnds: findOutstandingMock,
    } as never as IReceivableBalanceHistoryQuery;
    const tenantContext = {
      getOrganizationId: () => 'org-1',
    } as never as TenantContextService;
    const service = new TrendReportQueryService(
      trendRepo,
      historyQuery,
      tenantContext,
    );
    return { service, findCollectedMock, findOutstandingMock };
  }

  it.each([3, 6, 12] as const)(
    'returns exactly %i oldest-to-newest monthly points ending in the current month',
    async (months) => {
      const { service, findCollectedMock, findOutstandingMock } =
        buildService();

      const result = await service.getTrend(months);

      expect(result.months).toBe(months);
      expect(result.items).toHaveLength(months);
      expect(
        result.items.map((point: ReportsTrendPoint) => point.month),
      ).toEqual(expect.arrayContaining(['2026-08']));
      const keys = result.items.map((point: ReportsTrendPoint) => point.month);
      expect([...keys].sort()).toEqual(keys);
      expect(keys[keys.length - 1]).toBe('2026-08');

      const windows = findCollectedMock.mock.calls[0]?.[1] as ReportingMonth[];
      expect(windows).toHaveLength(months);
      expect(windows[0]).toMatchObject({
        key: months === 3 ? '2026-06' : months === 6 ? '2026-03' : '2025-09',
        isCurrent: false,
      });
      expect(windows[windows.length - 1]).toMatchObject({
        key: '2026-08',
        isCurrent: true,
        end: new Date('2026-08-14T09:00:00.000Z'),
        endExclusive: new Date('2026-08-14T09:00:00.001Z'),
      });
      expect(findOutstandingMock).toHaveBeenCalledWith(
        'org-1',
        windows.map((window) => window.end),
      );
    },
  );

  it('defaults to 12 months', async () => {
    const { service, findCollectedMock } = buildService();

    await service.getTrend();

    expect(findCollectedMock).toHaveBeenCalledTimes(1);
    const windows = findCollectedMock.mock.calls[0]?.[1] as ReportingMonth[];
    expect(windows).toHaveLength(12);
    expect(windows[0].key).toBe('2025-09');
  });

  it('computes completed month ends at their Asia/Ho_Chi_Minh calendar boundary', async () => {
    const { service, findCollectedMock } = buildService();

    await service.getTrend(3);

    const windows = findCollectedMock.mock.calls[0]?.[1] as ReportingMonth[];
    expect(windows[0].start).toEqual(new Date('2026-05-31T17:00:00.000Z'));
    expect(windows[0].end).toEqual(new Date('2026-06-30T16:59:59.999Z'));
    expect(windows[0].endExclusive).toEqual(
      new Date('2026-06-30T17:00:00.000Z'),
    );
    expect(windows[1].start).toEqual(new Date('2026-06-30T17:00:00.000Z'));
    expect(windows[1].end).toEqual(new Date('2026-07-31T16:59:59.999Z'));
    expect(windows[1].endExclusive).toEqual(
      new Date('2026-07-31T17:00:00.000Z'),
    );
  });

  it('zero-fills missing outstanding and collected months', async () => {
    const { service } = buildService(
      [
        { month: '2026-06', outstanding: null },
        { month: '2026-07', outstanding: 5_000_000 },
        { month: '2026-08', outstanding: 2_000_000 },
      ],
      [{ month: '2026-07', collected: 3_000_000 }],
    );

    const result = await service.getTrend(3);

    expect(result.items).toEqual([
      { month: '2026-06', outstanding: 0, collected: 0 },
      { month: '2026-07', outstanding: 5_000_000, collected: 3_000_000 },
      { month: '2026-08', outstanding: 2_000_000, collected: 0 },
    ]);
  });

  it('passes the current tenant to both dependencies', async () => {
    const { service, findCollectedMock, findOutstandingMock } = buildService();

    await service.getTrend(6);

    expect(findCollectedMock).toHaveBeenCalledWith('org-1', expect.any(Array));
    expect(findOutstandingMock).toHaveBeenCalledWith(
      'org-1',
      expect.any(Array),
    );
  });
});
