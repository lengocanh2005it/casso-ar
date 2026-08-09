import { ErrorCode } from '../../../common/errors/error-code';
import { Role } from '../../organizations/domain/membership';
import { InternalTask } from '../domain/internal-task';
import { DismissTaskUseCase } from './dismiss-task.usecase';

function buildTask(assignedToUserId = 'user-1'): InternalTask {
  return new InternalTask({
    id: 'task-1',
    organizationId: 'org-1',
    receivableId: 'rec-1',
    assignedToUserId,
    createdByUserId: null,
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

function buildDeps(task: InternalTask | null) {
  return {
    internalTaskRepo: {
      findById: jest.fn().mockResolvedValue(task),
      save: jest.fn(),
    },
    dataSource: { transaction: jest.fn(async (callback) => callback({})) },
  };
}

describe('DismissTaskUseCase', () => {
  it('dismisses an open task when the actor is the assignee', async () => {
    const deps = buildDeps(buildTask());
    const useCase = new DismissTaskUseCase(
      deps.internalTaskRepo as any,
      deps.dataSource as any,
    );

    const result = await useCase.execute('task-1', {
      userId: 'user-1',
      role: Role.ACCOUNTANT,
    });

    expect(result.status).toBe('DISMISSED');
    expect(deps.internalTaskRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'DISMISSED' }),
      expect.anything(),
    );
  });

  it('allows an OWNER to dismiss another user’s task', async () => {
    const deps = buildDeps(buildTask('user-1'));
    const useCase = new DismissTaskUseCase(
      deps.internalTaskRepo as any,
      deps.dataSource as any,
    );

    await expect(
      useCase.execute('task-1', { userId: 'owner-1', role: Role.OWNER }),
    ).resolves.toMatchObject({ status: 'DISMISSED' });
  });

  it('rejects a non-assignee who is not an OWNER', async () => {
    const deps = buildDeps(buildTask());
    const useCase = new DismissTaskUseCase(
      deps.internalTaskRepo as any,
      deps.dataSource as any,
    );

    await expect(
      useCase.execute('task-1', {
        userId: 'user-2',
        role: Role.FINANCE_MANAGER,
      }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.FORBIDDEN });
    expect(deps.internalTaskRepo.save).not.toHaveBeenCalled();
  });

  it('rejects a missing task', async () => {
    const deps = buildDeps(null);
    const useCase = new DismissTaskUseCase(
      deps.internalTaskRepo as any,
      deps.dataSource as any,
    );

    await expect(
      useCase.execute('missing', { userId: 'user-1', role: Role.ACCOUNTANT }),
    ).rejects.toMatchObject({ errorCode: ErrorCode.NOT_FOUND });
  });
});
