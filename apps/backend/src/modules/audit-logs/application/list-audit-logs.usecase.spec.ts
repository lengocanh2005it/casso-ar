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
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
    );

    const result = await useCase.execute({ page: 1, limit: 20 });

    expect(result).toEqual({ items: logs, total: 1 });
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
    const useCase = new ListAuditLogsUseCase(
      repo as never,
      tenantContext as never,
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
});
