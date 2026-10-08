import type { QueryRunner } from 'typeorm';
import { AddReminderExecutionRecoveryIndex20261008010000 } from './20261008010000-add-reminder-execution-recovery-index';

describe('AddReminderExecutionRecoveryIndex20261008010000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('indexes stale rule-based pending executions by organization and creation time', async () => {
    const { query, runner } = makeRunner();

    await new AddReminderExecutionRecoveryIndex20261008010000().up(runner);

    expect(query).toHaveBeenCalledWith(
      'CREATE INDEX IF NOT EXISTS "IDX_reminder_executions_pending_recovery" ON "reminder_executions" ("organizationId", "createdAt") WHERE "status" = \'PENDING\' AND "reminderRuleId" IS NOT NULL',
    );
  });

  it('drops the index on down', async () => {
    const { query, runner } = makeRunner();

    await new AddReminderExecutionRecoveryIndex20261008010000().down(runner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_reminder_executions_pending_recovery"',
    );
  });
});
