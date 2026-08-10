import { Permission } from '@casso-ledger/shared-types';
import { REQUIRED_PERMISSION_KEY } from '../../../common/rbac/require-permission.decorator';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import { InternalTasksController } from './internal-tasks.controller';

function buildTask(): InternalTask {
  return new InternalTask({
    id: 'task-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId: 'user-2',
    createdByUserId: 'user-1',
    taskType: 'MANUAL',
    title: 'Call customer',
    description: null,
    dueDate: null,
    status: 'OPEN',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
    version: 1,
  });
}

describe('InternalTasksController', () => {
  it('creates a task through idempotency and maps the response', async () => {
    const task = buildTask();
    const createManualTaskUseCase = {
      execute: jest.fn().mockResolvedValue(task),
    };
    const idempotency = {
      execute: jest.fn(async (_endpoint, _key, _input, operation) =>
        operation(),
      ),
    };
    const controller = new InternalTasksController(
      { execute: jest.fn() } as any,
      createManualTaskUseCase as any,
      { execute: jest.fn() } as any,
      { execute: jest.fn() } as any,
      {
        getCurrentUser: jest
          .fn()
          .mockReturnValue({ userId: 'user-1', role: Role.ACCOUNTANT }),
      } as any,
      idempotency as any,
    );

    const result = await controller.createManualTask(
      'rec-1',
      {
        assignedToUserId: 'user-2',
        title: 'Call customer',
        description: undefined,
        dueDate: '2026-08-20',
      },
      'idem-1',
    );

    expect(createManualTaskUseCase.execute).toHaveBeenCalledWith({
      receivableId: 'rec-1',
      assignedToUserId: 'user-2',
      title: 'Call customer',
      description: null,
      dueDate: new Date('2026-08-20'),
      createdByUserId: 'user-1',
    });
    expect(result).not.toHaveProperty('organizationId');
    expect(result).not.toHaveProperty('version');
  });

  it('requires INTERNAL_TASK_MANAGE to resolve or dismiss a task, not just RECEIVABLE_READ', () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        InternalTasksController.prototype.resolve,
      ),
    ).toBe(Permission.INTERNAL_TASK_MANAGE);
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION_KEY,
        InternalTasksController.prototype.dismiss,
      ),
    ).toBe(Permission.INTERNAL_TASK_MANAGE);
  });
});
