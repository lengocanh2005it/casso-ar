import {
  AuditActionType,
  AuditEntityType,
} from '../../../common/audit/audit.enums';
import { AuditLog } from '../../../common/audit/audit-log';
import { ListAuditLogsUseCase } from './list-audit-logs.usecase';

function buildLog(
  overrides: Partial<ConstructorParameters<typeof AuditLog>[0]> = {},
) {
  return new AuditLog({
    id: 'log-1',
    organizationId: 'org-1',
    userId: 'user-1',
    actionType: AuditActionType.PAYMENT_ALLOCATE,
    entityType: AuditEntityType.PAYMENT,
    entityId: 'payment-1',
    beforeState: null,
    afterState: { amount: 1000 },
    ipAddress: '203.0.113.5',
    createdAt: new Date('2026-08-12'),
    ...overrides,
  });
}

describe('ListAuditLogsUseCase', () => {
  it('returns a tenant-scoped page of audit logs', async () => {
    const logs = [buildLog()];
    const repo = {
      create: jest.fn(),
      findPage: jest.fn().mockResolvedValue({ items: logs, total: 1 }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result).toEqual({
      items: [
        expect.objectContaining({
          ...logs[0],
          display: {
            entityLabel: null,
            customerNames: {},
            invoiceNumbers: {},
          },
        }),
      ],
      total: 1,
    });
    expect(repo.findPage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
    });
  });

  it('passes every filter through to the repository', async () => {
    const repo = {
      create: jest.fn(),
      findPage: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await useCase.execute({
      page: 2,
      limit: 50,
      entityType: AuditEntityType.RECEIVABLE,
      actionType: AuditActionType.RECEIVABLE_CREATE,
      actorUserId: 'user-9',
      from: new Date('2026-08-01'),
      to: new Date('2026-08-31'),
    });

    expect(repo.findPage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      page: 2,
      limit: 50,
      entityType: AuditEntityType.RECEIVABLE,
      actionType: AuditActionType.RECEIVABLE_CREATE,
      actorUserId: 'user-9',
      from: new Date('2026-08-01'),
      to: new Date('2026-08-31'),
    });
  });

  it('passes receivableId through to the repository as relatedReceivableId', async () => {
    const repo = {
      create: jest.fn(),
      findPage: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    await useCase.execute({ page: 1, limit: 20, receivableId: 'rec-1' });

    expect(repo.findPage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      relatedReceivableId: 'rec-1',
    });
  });

  it('resolves customer and invoice display references in one batched lookup per page', async () => {
    const afterState = {
      id: 'rec-1',
      customerId: 'cust-1',
      invoiceId: 'inv-1',
    };
    const logs = [
      buildLog({
        entityType: AuditEntityType.RECEIVABLE,
        entityId: 'rec-1',
        afterState,
      }),
    ];
    const repo = {
      create: jest.fn(),
      findPage: jest.fn().mockResolvedValue({ items: logs, total: 1 }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const customerRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(new Map([['cust-1', { name: 'Công ty ABC' }]])),
    };
    const invoiceRepo = {
      findByIds: jest
        .fn()
        .mockResolvedValue(new Map([['inv-1', { invoiceNumber: 'INV-001' }]])),
    };
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(customerRepo.findByIds).toHaveBeenCalledWith(['cust-1']);
    expect(invoiceRepo.findByIds).toHaveBeenCalledWith(['inv-1']);
    expect(result.items[0].display).toEqual({
      entityLabel: 'INV-001 · Công ty ABC',
      customerNames: { 'cust-1': 'Công ty ABC' },
      invoiceNumbers: { 'inv-1': 'INV-001' },
    });
    expect(result.items[0].afterState).toEqual(afterState);
  });

  it('uses a stable customer fallback when a referenced customer is gone', async () => {
    const customerId = 'cust-missing';
    const logs = [buildLog({ afterState: { customerId } })];
    const repo = {
      create: jest.fn(),
      findPage: jest.fn().mockResolvedValue({ items: logs, total: 1 }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const customerRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const invoiceRepo = { findByIds: jest.fn().mockResolvedValue(new Map()) };
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
      customerRepo as never,
      invoiceRepo as never,
    );

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result.items[0].display.customerNames).toEqual({
      [customerId]: 'Khách hàng không xác định',
    });
    expect(result.items[0].display.entityLabel).toBeNull();
  });
});
