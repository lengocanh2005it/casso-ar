import { InternalTask } from '../domain/internal-task';
import { ListReceivableTasksUseCase } from './list-receivable-tasks.usecase';

describe('ListReceivableTasksUseCase', () => {
  it('returns tenant-scoped tasks from the repository', async () => {
    const tasks = [
      new InternalTask({
        id: 'task-1',
        organizationId: 'org-1',
        receivableId: 'rec-1',
        assignedToUserId: 'user-1',
        createdByUserId: null,
        taskType: 'MANUAL',
        title: 'Call customer',
        description: null,
        dueDate: null,
        status: 'OPEN',
        createdAt: new Date('2026-08-01'),
        resolvedAt: null,
        version: 1,
      }),
    ];
    const internalTaskRepo = {
      findPageByReceivableId: jest
        .fn()
        .mockResolvedValue({ items: tasks, total: tasks.length }),
    };
    const useCase = new ListReceivableTasksUseCase(internalTaskRepo as any);

    await expect(useCase.execute('rec-1', 2, 20)).resolves.toEqual({
      items: tasks,
      total: 1,
    });
    expect(internalTaskRepo.findPageByReceivableId).toHaveBeenCalledWith(
      'rec-1',
      2,
      20,
    );
  });
});
