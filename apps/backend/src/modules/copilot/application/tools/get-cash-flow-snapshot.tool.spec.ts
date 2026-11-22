import { Role } from '../../../organizations/domain/membership';
import { GetCashFlowSnapshotTool } from './get-cash-flow-snapshot.tool';

function buildServices(overrides: Record<string, unknown> = {}) {
  return {
    dashboard: {
      getSummary: jest.fn().mockResolvedValue({
        totalOutstanding: '1000000',
        totalOverdue: '200000',
        overdueRate: 0.2,
        cashForecast: {
          forecast7d: '10',
          forecast14d: '20',
          forecast30d: '30',
        },
        autoMatchRate: 0.8,
        manualHandlingRate: 0.2,
        reminderEffectiveness: 0.5,
        topOverdueCustomers: [
          {
            customerId: 'cust-1',
            customerName: 'Alpha',
            totalOverdue: '200000',
          },
        ],
      }),
    },
    aging: {
      getAgingBuckets: jest
        .fn()
        .mockResolvedValue([
          { bucket: 'OVERDUE_8_30', count: 2, totalRemaining: '9' },
        ]),
    },
    trend: {
      getTrend: jest.fn().mockResolvedValue({
        months: 6,
        items: [{ month: '2026-11', outstanding: '5', collected: '7' }],
      }),
    },
    tenantContext: {
      getCurrentUser: jest
        .fn()
        .mockReturnValue({ role: Role.FINANCE_MANAGER, userId: 'user-1' }),
    },
    ...overrides,
  };
}

describe('GetCashFlowSnapshotTool', () => {
  it('calls each reporting query service once and returns the assembled snapshot', async () => {
    const services = buildServices();
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    const result = await tool.execute();

    expect(services.dashboard.getSummary).toHaveBeenCalledTimes(1);
    expect(services.aging.getAgingBuckets).toHaveBeenCalledTimes(1);
    expect(services.trend.getTrend).toHaveBeenCalledWith(6);
    expect(result).toEqual({
      dashboard: await services.dashboard.getSummary.mock.results[0].value,
      aging: await services.aging.getAgingBuckets.mock.results[0].value,
      trend: await services.trend.getTrend.mock.results[0].value,
    });
  });

  it('passes the user id to aging only for SALES_REP', async () => {
    const services = buildServices({
      tenantContext: {
        getCurrentUser: jest
          .fn()
          .mockReturnValue({ role: Role.SALES_REP, userId: 'sales-1' }),
      },
    });
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    await tool.execute();

    expect(services.aging.getAgingBuckets).toHaveBeenCalledWith('sales-1');
  });

  it('calls aging with no argument for non-SALES_REP roles', async () => {
    const services = buildServices();
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    await tool.execute();

    expect(services.aging.getAgingBuckets).toHaveBeenCalledWith();
  });

  it('rejects when a query service fails, without a partial snapshot', async () => {
    const services = buildServices({
      dashboard: {
        getSummary: jest.fn().mockRejectedValue(new Error('db down')),
      },
    });
    const tool = new GetCashFlowSnapshotTool(
      services.dashboard as any,
      services.aging as any,
      services.trend as any,
      services.tenantContext as any,
    );

    await expect(tool.execute()).rejects.toThrow('db down');
  });
});
