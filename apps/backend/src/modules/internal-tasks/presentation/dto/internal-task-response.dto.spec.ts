import { InternalTask } from '../../domain/internal-task';
import { toInternalTaskResponse } from './internal-task-response.dto';

it('maps a task without leaking tenant or optimistic-lock fields', () => {
  const response = toInternalTaskResponse(
    new InternalTask({
      id: 'task-1',
      organizationId: 'org-1',
      receivableId: 'rec-1',
      assignedToUserId: 'user-1',
      createdByUserId: 'user-2',
      taskType: 'MANUAL',
      title: 'Call customer',
      description: null,
      dueDate: null,
      status: 'OPEN',
      createdAt: new Date('2026-08-01'),
      resolvedAt: null,
      version: 1,
    }),
  );

  expect(response).toEqual({
    id: 'task-1',
    receivableId: 'rec-1',
    assignedToUserId: 'user-1',
    createdByUserId: 'user-2',
    taskType: 'MANUAL',
    title: 'Call customer',
    description: null,
    dueDate: null,
    status: 'OPEN',
    createdAt: new Date('2026-08-01'),
    resolvedAt: null,
  });
});
