import {
  ReminderExecution,
  ReminderExecutionStatus,
  ReminderSkipReason,
} from './reminder-execution';

describe('ReminderExecution', () => {
  it('carries all required fields', () => {
    const execution = new ReminderExecution({
      id: 'exec-1',
      organizationId: 'org-1',
      receivableId: 'recv-1',
      reminderRuleId: 'rule-1',
      minIntervalDays: 7,
      executionDate: new Date('2026-08-06'),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date('2026-08-06'),
    });

    expect(execution.id).toBe('exec-1');
    expect(execution.status).toBe(ReminderExecutionStatus.PENDING);
    expect(execution.minIntervalDays).toBe(7);
  });

  it('supports nullable reminderRuleId for manual sends', () => {
    const execution = new ReminderExecution({
      id: 'exec-2',
      organizationId: 'org-1',
      receivableId: 'recv-1',
      reminderRuleId: null,
      minIntervalDays: null,
      executionDate: new Date('2026-08-06'),
      sentAt: null,
      status: ReminderExecutionStatus.PENDING,
      skipReason: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date('2026-08-06'),
    });

    expect(execution.reminderRuleId).toBeNull();
  });

  it('supports skip reasons', () => {
    const execution = new ReminderExecution({
      id: 'exec-3',
      organizationId: 'org-1',
      receivableId: 'recv-1',
      reminderRuleId: 'rule-1',
      minIntervalDays: null,
      executionDate: new Date('2026-08-06'),
      sentAt: null,
      status: ReminderExecutionStatus.SKIPPED,
      skipReason: ReminderSkipReason.ALREADY_PAID,
      providerMessageId: null,
      failureReason: null,
      createdAt: new Date('2026-08-06'),
    });

    expect(execution.skipReason).toBe(ReminderSkipReason.ALREADY_PAID);
  });
});
