import {
  ReminderExecution,
  ReminderExecutionStatus,
} from './reminder-execution';

describe('ReminderExecution', () => {
  it('carries the version field used for optimistic locking', () => {
    const execution = new ReminderExecution({
      id: 'exec-1',
      organizationId: 'org-1',
      receivableId: 'recv-1',
      reminderRuleId: null,
      executionDate: new Date('2026-08-06'),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date('2026-08-06'),
      version: 1,
    });

    expect(execution.version).toBe(1);
  });
});
