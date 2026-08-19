import type { QueryRunner } from 'typeorm';
import { AddCopilotMessagesIsPartial20260825000000 } from './20260825000000-add-copilot-messages-is-partial';

describe('AddCopilotMessagesIsPartial20260825000000', () => {
  it('adds the isPartial column defaulting to false', async () => {
    const migration = new AddCopilotMessagesIsPartial20260825000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "copilot_messages" ADD COLUMN IF NOT EXISTS "isPartial" boolean NOT NULL DEFAULT false',
    );
  });

  it('reverts by dropping the column', async () => {
    const migration = new AddCopilotMessagesIsPartial20260825000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "copilot_messages" DROP COLUMN IF EXISTS "isPartial"',
    );
  });
});
