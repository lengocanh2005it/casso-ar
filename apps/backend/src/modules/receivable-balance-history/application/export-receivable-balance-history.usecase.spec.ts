import { ReceivableStatus } from '@casso-ledger/shared-types';
import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { BalanceHistoryChangeSource } from '../domain/balance-history-change-source';
import {
  EXPORT_ROW_LIMIT,
  ExportReceivableBalanceHistoryUseCase,
} from './export-receivable-balance-history.usecase';
import { ListReceivableBalanceHistoryUseCase } from './list-receivable-balance-history.usecase';

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
  actorDisplayName: 'Nguyễn Văn A',
  transitionReferenceId: 'alloc-1',
  note: null,
};

function buildUseCase(options: {
  total?: number;
  items?: unknown[];
  auditCreate?: jest.Mock;
}) {
  const listUseCase = {
    execute: jest.fn().mockResolvedValue({
      items: options.items ?? [item],
      total: options.total ?? 1,
    }),
  } as never as ListReceivableBalanceHistoryUseCase;
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
    listUseCase,
    auditLogRepo as never,
    tenantContext as never,
  );
  return { useCase, listUseCase, auditLogRepo };
}

describe('ExportReceivableBalanceHistoryUseCase', () => {
  it('builds an audit-safe CSV with the export row limit', async () => {
    const { useCase, listUseCase } = buildUseCase({});

    const result = await useCase.execute({ filters: {} });

    expect(listUseCase.execute).toHaveBeenCalledWith({
      filters: {},
      page: 1,
      limit: EXPORT_ROW_LIMIT,
    });
    expect(result.csv).toContain(
      'Thời điểm hiệu lực,Mã hóa đơn,Khách hàng,Trạng thái,Số tiền còn lại',
    );
    expect(result.csv).toContain('INV-001,Công ty A,PAID,0,ALLOCATE');
    expect(result.csv).toContain('Nguyễn Văn A');
    expect(result.csv).not.toContain('organizationId');
    expect(result.csv).not.toContain('@example.com');
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
          actorType: null,
        },
        truncated: true,
        rowCount: 1,
      },
    });
  });

  it('does not write an audit log when the export fails', async () => {
    const auditCreate = jest.fn().mockResolvedValue(undefined);
    const listUseCase = {
      execute: jest.fn().mockRejectedValue(new Error('db down')),
    } as never as ListReceivableBalanceHistoryUseCase;
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
      listUseCase,
      auditLogRepo as never,
      tenantContext as never,
    );

    await expect(useCase.execute({ filters: {} })).rejects.toThrow('db down');
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
