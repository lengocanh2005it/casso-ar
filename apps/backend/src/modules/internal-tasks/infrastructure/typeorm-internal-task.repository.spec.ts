import { TenantContextService } from '../../../common/tenancy/tenant-context';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import { TypeOrmInternalTaskRepository } from './typeorm-internal-task.repository';

function buildTask(): InternalTask {
  return new InternalTask({
    id: 'task-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId: 'user-1',
    createdByUserId: null,
    taskType: 'ESCALATION',
    title: 'Overdue receivable requires action',
    description: null,
    dueDate: null,
    status: 'OPEN',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
    version: 1,
  });
}

describe('TypeOrmInternalTaskRepository', () => {
  it('maps and tenant-scopes a task when saving', async () => {
    const ormRepo = { save: jest.fn().mockResolvedValue(undefined) };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmInternalTaskRepository(
      ormRepo as any,
      tenantContext,
    );

    await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.save(buildTask()),
    );

    expect(ormRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'task-1',
        organizationId: 'org-1',
        status: 'OPEN',
        version: 1,
      }),
    );
    expect(ormRepo.save.mock.calls[0][0]).not.toBeInstanceOf(InternalTask);
  });

  it('returns a selected, paginated task page with its total', async () => {
    const ormRepo = {
      find: jest.fn().mockResolvedValue([buildTask()]),
      count: jest.fn().mockResolvedValue(3),
    };
    const tenantContext = new TenantContextService();
    const repository = new TypeOrmInternalTaskRepository(
      ormRepo as any,
      tenantContext,
    );

    const result = await tenantContext.run(
      { userId: 'user-1', organizationId: 'org-1', role: Role.OWNER },
      () => repository.findPageByReceivableId('rec-1', 2, 20),
    );

    expect(result).toEqual({ items: [expect.any(InternalTask)], total: 3 });
    expect(ormRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 20 }),
    );
    expect(ormRepo.count).toHaveBeenCalledWith({
      where: { organizationId: 'org-1', receivableId: 'rec-1' },
    });
  });
});
