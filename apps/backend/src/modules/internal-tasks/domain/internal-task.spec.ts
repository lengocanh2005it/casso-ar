import { InternalTask } from './internal-task';

function buildTask(
  overrides: Partial<ConstructorParameters<typeof InternalTask>[0]> = {},
): InternalTask {
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
    ...overrides,
  });
}

describe('InternalTask domain entity', () => {
  it('resolves an open task and sets resolvedAt', () => {
    const resolved = buildTask().resolve();

    expect(resolved.status).toBe('DONE');
    expect(resolved.resolvedAt).not.toBeNull();
  });

  it('rejects resolving a non-open task', () => {
    const done = buildTask({
      status: 'DONE',
      resolvedAt: new Date('2026-08-02'),
    });

    expect(() => done.resolve()).toThrow(
      'Cannot resolve a task in status DONE',
    );
  });
});
