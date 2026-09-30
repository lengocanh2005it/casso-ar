import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import type { TenantContextService } from '../../../common/tenancy/tenant-context';
import type {
  DashboardPeriod,
  IDashboardSummaryRepository,
} from './dashboard-summary.repository.port';
import { DashboardSummaryQueryService } from './dashboard-summary-query.service';

const TIMEZONE = 'Asia/Ho_Chi_Minh';

function buildService(
  overrides: Partial<{
    outstanding: { totalOutstanding: number; totalOverdue: number };
    forecast: { forecast7d: number; forecast14d: number; forecast30d: number };
    topOverdueCustomers: Array<{
      customerId: string;
      customerName: string;
      totalOverdue: number;
    }>;
    autoMatch: { matchedCount: number; totalCount: number };
    reminder: { paidWithin7dCount: number; sentCount: number };
  }> = {},
) {
  const repo: IDashboardSummaryRepository = {
    getOutstandingSummary: jest
      .fn()
      .mockResolvedValue(
        overrides.outstanding ?? { totalOutstanding: 100, totalOverdue: 30 },
      ),
    getForecast: jest.fn().mockResolvedValue(
      overrides.forecast ?? {
        forecast7d: 10,
        forecast14d: 20,
        forecast30d: 30,
      },
    ),
    getTopOverdueCustomers: jest
      .fn()
      .mockResolvedValue(overrides.topOverdueCustomers ?? []),
    getAutoMatchStats: jest
      .fn()
      .mockResolvedValue(
        overrides.autoMatch ?? { matchedCount: 8, totalCount: 10 },
      ),
    getReminderEffectivenessStats: jest
      .fn()
      .mockResolvedValue(
        overrides.reminder ?? { paidWithin7dCount: 1, sentCount: 2 },
      ),
  };
  const tenantContext = {
    getOrganizationId: () => 'org-1',
    getCurrentUser: () => undefined,
  } as never as TenantContextService;
  return {
    repo,
    service: new DashboardSummaryQueryService(repo, tenantContext),
  };
}

function currentMonthPeriod(): DashboardPeriod {
  const now = new Date();
  const month = formatInTimeZone(now, TIMEZONE, 'yyyy-MM');
  const [year, monthNumber] = month.split('-').map(Number);
  const nextMonth =
    monthNumber === 12
      ? `${year + 1}-01`
      : `${year}-${String(monthNumber + 1).padStart(2, '0')}`;

  return {
    from: fromZonedTime(`${month}-01T00:00:00`, TIMEZONE),
    to: fromZonedTime(`${nextMonth}-01T00:00:00`, TIMEZONE),
  };
}

describe('DashboardSummaryQueryService', () => {
  it('computes dashboard ratios and combines repository summaries', async () => {
    const { service } = buildService({
      topOverdueCustomers: [
        { customerId: 'customer-1', customerName: 'ACME', totalOverdue: 30 },
      ],
    });

    const result = await service.getSummary({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-09T00:00:00.000Z'),
    });

    expect(result).toMatchObject({
      totalOutstanding: 100,
      totalOverdue: 30,
      overdueRate: 0.3,
      cashForecast: { forecast7d: 10, forecast14d: 20, forecast30d: 30 },
      topOverdueCustomers: [
        { customerId: 'customer-1', customerName: 'ACME', totalOverdue: 30 },
      ],
      autoMatchRate: 0.8,
      reminderEffectiveness: 0.5,
    });
    expect(result.manualHandlingRate).toBeCloseTo(0.2);
  });

  it('returns null for period metrics with no observations', async () => {
    const { service } = buildService({
      autoMatch: { matchedCount: 0, totalCount: 0 },
      reminder: { paidWithin7dCount: 0, sentCount: 0 },
    });

    const result = await service.getSummary({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-09T00:00:00.000Z'),
    });

    expect(result.autoMatchRate).toBeNull();
    expect(result.manualHandlingRate).toBeNull();
    expect(result.reminderEffectiveness).toBeNull();
  });

  it('uses the current Ho Chi Minh calendar month for omitted periods', async () => {
    const { service, repo } = buildService();

    await service.getSummary();

    const expectedPeriod = currentMonthPeriod();
    expect(repo.getAutoMatchStats).toHaveBeenCalledWith(
      'org-1',
      expectedPeriod,
    );
    expect(repo.getReminderEffectivenessStats).toHaveBeenCalledWith(
      'org-1',
      expectedPeriod,
    );
  });
});
