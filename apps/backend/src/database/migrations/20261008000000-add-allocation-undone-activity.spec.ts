import type { QueryRunner } from 'typeorm';
import { AddAllocationUndoneActivity20261008000000 } from './20261008000000-add-allocation-undone-activity';

describe('AddAllocationUndoneActivity20261008000000', () => {
  it('adds ALLOCATION_UNDONE to the collection activity enum transactionally', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;
    const migration = new AddAllocationUndoneActivity20261008000000();

    await migration.up(runner);

    expect(migration.transaction).toBe(true);
    expect(query).toHaveBeenCalledWith(
      `ALTER TYPE "collection_activities_activityType_enum" ADD VALUE IF NOT EXISTS 'ALLOCATION_UNDONE'`,
    );
  });

  it('keeps the added enum value on rollback', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const runner = { query } as unknown as QueryRunner;

    await new AddAllocationUndoneActivity20261008000000().down(runner);

    expect(query).not.toHaveBeenCalled();
  });
});
