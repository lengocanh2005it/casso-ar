import { Permission } from '@casso-ledger/shared-types';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { REQUIRED_PERMISSION_KEY } from '../../../common/rbac/require-permission.decorator';
import { ReportsController } from './reports.controller';

describe('ReportsController', () => {
  it('returns the aging report from the query service', async () => {
    const agingReportQueryService = {
      getAgingBuckets: jest
        .fn()
        .mockResolvedValue([
          { bucket: 'NOT_DUE', count: 1, totalRemaining: 100 },
        ]),
    };
    const dashboardSummaryQueryService = { getSummary: jest.fn() };
    const controller = new ReportsController(
      agingReportQueryService as never,
      dashboardSummaryQueryService as never,
      { execute: jest.fn() } as never,
    );

    await expect(controller.getAgingReport()).resolves.toEqual({
      buckets: [{ bucket: 'NOT_DUE', count: 1, totalRemaining: 100 }],
    });
  });

  it('converts a validated date range before calling the dashboard query service', async () => {
    const agingReportQueryService = { getAgingBuckets: jest.fn() };
    const dashboardSummaryQueryService = {
      getSummary: jest.fn().mockResolvedValue({ totalOutstanding: 0 }),
    };
    const controller = new ReportsController(
      agingReportQueryService as never,
      dashboardSummaryQueryService as never,
      { execute: jest.fn() } as never,
    );

    await controller.getDashboardSummary({
      from: '2026-08-01',
      to: '2026-08-09',
    });

    expect(dashboardSummaryQueryService.getSummary).toHaveBeenCalledWith({
      from: new Date('2026-08-01'),
      to: new Date('2026-08-09'),
    });
  });

  it('requires authentication and report read permission', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual([
      JwtAuthGuard,
      PermissionGuard,
    ]);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        ReportsController.prototype.getAgingReport,
      ),
    ).toBe(Permission.REPORT_READ);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        ReportsController.prototype.getDashboardSummary,
      ),
    ).toBe(Permission.REPORT_READ);
  });
});
