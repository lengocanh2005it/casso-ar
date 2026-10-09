import type { QueryRunner } from 'typeorm';
import { AddReminderExecutionMinInterval20261008020000 } from './20261008020000-add-reminder-execution-min-interval';

describe('AddReminderExecutionMinInterval20261008020000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('adds a nullable integer snapshot and backfills pending rows through the same tenant policy', async () => {
    const { query, runner } = makeRunner();
    const migration = new AddReminderExecutionMinInterval20261008020000();

    await migration.up(runner);

    expect(migration.transaction).toBe(true);
    expect(query).toHaveBeenNthCalledWith(
      1,
      'ALTER TABLE "reminder_executions" ADD COLUMN IF NOT EXISTS "minIntervalDays" integer',
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('e."organizationId" = p."organizationId"'),
    );
    expect(query.mock.calls[1][0]).toContain('e."status" = \'PENDING\'');
    expect(query.mock.calls[1][0]).toContain('e."minIntervalDays" IS NULL');
  });

  it('drops the snapshot column on rollback', async () => {
    const { query, runner } = makeRunner();

    await new AddReminderExecutionMinInterval20261008020000().down(runner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "reminder_executions" DROP COLUMN IF EXISTS "minIntervalDays"',
    );
  });
});
