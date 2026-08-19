import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCopilotConversationsTitle20260824000000
  implements MigrationInterface
{
  name = 'AddCopilotConversationsTitle20260824000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "copilot_conversations" ADD COLUMN IF NOT EXISTS "title" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "copilot_conversations" DROP COLUMN IF EXISTS "title"',
    );
  }
}
