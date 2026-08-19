import type { QueryRunner } from 'typeorm';
import { AddCopilotConversationsTitle20260824000000 } from './20260824000000-add-copilot-conversations-title';

describe('AddCopilotConversationsTitle20260824000000', () => {
  it('adds the nullable title column', async () => {
    const migration = new AddCopilotConversationsTitle20260824000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "copilot_conversations" ADD COLUMN IF NOT EXISTS "title" character varying',
    );
  });

  it('reverts by dropping the column', async () => {
    const migration = new AddCopilotConversationsTitle20260824000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "copilot_conversations" DROP COLUMN IF EXISTS "title"',
    );
  });
});
