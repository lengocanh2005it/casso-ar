import { Permission } from '@casso-ar/shared-types';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../../common/auth/jwt-auth.guard';
import { PermissionGuard } from '../../../common/rbac/permission.guard';
import { REQUIRED_PERMISSION_KEY } from '../../../common/rbac/require-permission.decorator';
import { ReceivableBalanceHistoryController } from './receivable-balance-history.controller';
import { ReceivableBalanceHistoryExportRateLimitGuard } from './receivable-balance-history-export-rate-limit.guard';

describe('ReceivableBalanceHistoryController', () => {
  function buildController() {
    const listUseCase = {
      execute: jest.fn().mockResolvedValue({
        items: [
          {
            id: 'h-1',
            sequence: 2,
            receivableId: 'rec-1',
            invoiceNumber: 'INV-001',
            customerId: 'cust-1',
            customerName: 'Công ty A',
            status: 'PAID',
            remainingAmount: 0,
            effectiveAt: new Date('2026-08-14T10:00:00.000Z'),
            changeSource: 'ALLOCATE',
            reasonCode: 'PAYMENT_ALLOCATED',
            actorType: 'USER',
            actorUserId: 'user-1',
            actorDisplayName: 'Nguyễn Văn A',
            transitionReferenceId: 'alloc-1',
            note: null,
          },
        ],
        total: 1,
      }),
    };
    const summaryUseCase = {
      execute: jest.fn().mockResolvedValue({
        totalTransitions: 1,
        affectedReceivables: 1,
        latestRemainingAmount: 0,
        dailySeries: [{ date: '2026-08-14', transitions: 1 }],
        sourceDistribution: [{ changeSource: 'ALLOCATE', count: 1 }],
      }),
    };
    const exportUseCase = {
      execute: jest
        .fn()
        .mockResolvedValue({ csv: 'a,b\r\n1,2', truncated: false }),
    };
    const controller = new ReceivableBalanceHistoryController(
      listUseCase as never,
      summaryUseCase as never,
      exportUseCase as never,
    );
    return { controller, listUseCase, summaryUseCase, exportUseCase };
  }

  it('lists with delegated filters and pagination response', async () => {
    const { controller, listUseCase } = buildController();

    const result = await controller.list({
      receivableId: 'rec-1',
      from: '2026-08-01',
      to: '2026-08-31',
      status: 'PAID',
      page: 2,
      limit: 50,
    } as never);

    expect(listUseCase.execute).toHaveBeenCalledWith({
      filters: {
        receivableId: 'rec-1',
        from: '2026-08-01',
        to: '2026-08-31',
        status: 'PAID',
        changeSource: undefined,
      },
      page: 2,
      limit: 50,
    });
    expect(result).toMatchObject({
      total: 1,
      page: 2,
      limit: 50,
      items: [
        {
          effectiveAt: '2026-08-14T10:00:00.000Z',
          actorDisplayName: 'Nguyễn Văn A',
        },
      ],
    });
    expect(result.items[0]).not.toHaveProperty('organizationId');
    expect(result.items[0].actorUserId).toBe('user-1');
  });

  it('defaults page and limit to 1 and 20', async () => {
    const { controller, listUseCase } = buildController();

    await controller.list({} as never);

    expect(listUseCase.execute).toHaveBeenCalledWith(
      expect.objectContaining({ page: undefined, limit: undefined }),
    );
  });

  it('summarizes with the delegated filters', async () => {
    const { controller, summaryUseCase } = buildController();

    const result = await controller.summary({
      from: '2026-08-01',
      to: '2026-08-31',
    } as never);

    expect(summaryUseCase.execute).toHaveBeenCalledWith({
      filters: {
        receivableId: undefined,
        from: '2026-08-01',
        to: '2026-08-31',
        status: undefined,
        changeSource: undefined,
      },
    });
    expect(result).toMatchObject({
      totalTransitions: 1,
      dailySeries: [{ date: '2026-08-14', transitions: 1 }],
    });
  });

  it('exports CSV and sets the truncation header', async () => {
    const { controller, exportUseCase } = buildController();
    exportUseCase.execute.mockResolvedValueOnce({
      csv: 'a\r\n1',
      truncated: true,
    });
    const response = { setHeader: jest.fn(), send: jest.fn() };

    await controller.exportCsv(
      response as never,
      { from: '2026-08-01' } as never,
    );

    expect(exportUseCase.execute).toHaveBeenCalledWith({
      filters: {
        receivableId: undefined,
        from: '2026-08-01',
        to: undefined,
        status: undefined,
        changeSource: undefined,
      },
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'X-Export-Truncated',
      'true',
    );
    expect(response.send).toHaveBeenCalledWith('a\r\n1');
  });

  it('requires authentication and receivable audit read permission', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ReceivableBalanceHistoryController),
    ).toEqual([JwtAuthGuard, PermissionGuard]);
    for (const method of ['list', 'summary', 'exportCsv'] as const) {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSION_KEY,
          ReceivableBalanceHistoryController.prototype[method],
        ),
      ).toBe(Permission.RECEIVABLE_AUDIT_READ);
    }
  });

  it('rate limits the export to ten requests per minute per user', () => {
    const handlerGuards = Reflect.getMetadata(
      GUARDS_METADATA,
      ReceivableBalanceHistoryController.prototype.exportCsv,
    );
    expect(handlerGuards).toContain(
      ReceivableBalanceHistoryExportRateLimitGuard,
    );
    expect(
      Reflect.getMetadata(
        'THROTTLER:LIMITdefault',
        ReceivableBalanceHistoryController.prototype.exportCsv,
      ),
    ).toBe(10);
    expect(
      Reflect.getMetadata(
        'THROTTLER:TTLdefault',
        ReceivableBalanceHistoryController.prototype.exportCsv,
      ),
    ).toBe(60_000);
  });
});
