import { ReceivableStatus } from '@casso-ar/shared-types';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import {
  EXPORT_ROW_LIMIT,
  ExportReceivableBalanceHistoryUseCase,
} from './export-receivable-balance-history.usecase';
import type { IReceivableBalanceHistoryQuery } from './receivable-balance-history-query.port';

const item = {
  id: 'h-1',
  sequence: 1,
  receivableId: 'rec-1',
  invoiceNumber: 'INV-001',
  customerId: 'cust-1',
  customerName: 'Công ty A',
  status: 'PAID',
  remainingAmount: 0,
  effectiveAt: new Date('2026-08-14T10:00:00.000Z'),
  changeSource: BalanceHistoryChangeSource.ALLOCATE,
  reasonCode: 'PAYMENT_ALLOCATED',
  actorType: 'USER',
  actorUserId: 'user-1',
  actorDisplayName: 'Nguyễn Văn A',
  transitionReferenceId: 'alloc-1',
  note: null,
};

function buildUseCase(options: {
  total?: number;
  items?: unknown[];
  auditCreate?: jest.Mock;
}) {
  const historyQuery = {
    list: jest.fn().mockResolvedValue({
      items: options.items ?? [item],
      total: options.total ?? 1,
    }),
  };
  const auditLogRepo = {
    create: options.auditCreate ?? jest.fn().mockResolvedValue(undefined),
  };
  const tenantContext = {
    getOrganizationId: () => 'org-1',
    getCurrentUser: () => ({
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'OWNER',
    }),
  };
  const useCase = new ExportReceivableBalanceHistoryUseCase(
    historyQuery as never,
    auditLogRepo as never,
    tenantContext as never,
  );
  return { useCase, historyQuery, auditLogRepo };
}

describe('ExportReceivableBalanceHistoryUseCase', () => {
  it('defaults to the latest 30 local calendar days', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-31T04:00:00.000Z'));
    const { useCase, historyQuery } = buildUseCase({});

    try {
      await useCase.execute({ filters: {} });
    } finally {
      jest.useRealTimers();
    }

    expect(historyQuery.list).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        from: new Date('2026-08-01T17:00:00.000Z'),
        to: new Date('2026-08-31T17:00:00.000Z'),
      }),
      1,
      EXPORT_ROW_LIMIT,
    );
  });

  it('builds an audit-safe CSV with the export row limit', async () => {
    const { useCase, historyQuery } = buildUseCase({});

    const result = await useCase.execute({
      filters: { from: '2026-08-01', to: '2026-08-31' },
    });

    expect(historyQuery.list).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({
        from: new Date('2026-07-31T17:00:00.000Z'),
        to: new Date('2026-08-31T17:00:00.000Z'),
      }),
      1,
      EXPORT_ROW_LIMIT,
    );
    expect(result.csv).toContain(
      'Thời điểm hiệu lực,Mã hóa đơn,Khách hàng,Trạng thái,Số tiền còn lại',
    );
    expect(result.csv).toContain('INV-001,Công ty A,PAID,0,ALLOCATE');
    expect(result.csv).toContain('Nguyễn Văn A');
    expect(result.csv).not.toContain('organizationId');
    expect(result.csv).not.toContain('@example.com');
  });

  it('converts local date filters to HCMC day boundaries', async () => {
    const { useCase, historyQuery } = buildUseCase({});

    await useCase.execute({
      filters: { from: '2026-08-01', to: '2026-08-31' },
    });

    const [, filters] = historyQuery.list.mock.calls[0];
    expect(filters).toMatchObject({
      from: new Date('2026-07-31T17:00:00.000Z'),
      to: new Date('2026-08-31T17:00:00.000Z'),
    });
  });

  it('flags the export as truncated when more rows match the limit', async () => {
    const { useCase } = buildUseCase({ total: EXPORT_ROW_LIMIT + 1 });

    const result = await useCase.execute({ filters: {} });

    expect(result.truncated).toBe(true);
  });

  it('keeps the export untruncated when rows fit the limit', async () => {
    const { useCase } = buildUseCase({ total: EXPORT_ROW_LIMIT });

    const result = await useCase.execute({ filters: {} });

    expect(result.truncated).toBe(false);
  });

  it('writes exactly one export audit log with the filter scope and truncation', async () => {
    const auditCreate = jest.fn().mockResolvedValue(undefined);
    const { useCase } = buildUseCase({
      total: EXPORT_ROW_LIMIT + 5,
      auditCreate,
    });

    await useCase.execute({
      filters: {
        from: '2026-08-01',
        to: '2026-08-31',
        status: ReceivableStatus.OPEN,
      },
    });

    expect(auditCreate).toHaveBeenCalledTimes(1);
    const log = auditCreate.mock.calls[0][0];
    expect(log).toMatchObject({
      organizationId: 'org-1',
      userId: 'user-1',
      actionType: AuditActionType.RECEIVABLE_BALANCE_HISTORY_EXPORT,
      entityType: AuditEntityType.RECEIVABLE_BALANCE_HISTORY,
      entityId: 'org-1',
      beforeState: null,
      afterState: {
        filters: {
          receivableId: null,
          from: '2026-08-01',
          to: '2026-08-31',
          status: 'OPEN',
          changeSource: null,
        },
        truncated: true,
        rowCount: 1,
      },
    });
  });

  it('does not write an audit log when the export fails', async () => {
    const auditCreate = jest.fn().mockResolvedValue(undefined);
    const historyQuery = {
      list: jest.fn().mockRejectedValue(new Error('db down')),
    } as never as IReceivableBalanceHistoryQuery;
    const auditLogRepo = { create: auditCreate };
    const tenantContext = {
      getOrganizationId: () => 'org-1',
      getCurrentUser: () => ({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'OWNER',
      }),
    };
    const useCase = new ExportReceivableBalanceHistoryUseCase(
      historyQuery,
      auditLogRepo as never,
      tenantContext as never,
    );

    await expect(useCase.execute({ filters: {} })).rejects.toThrow('db down');
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
