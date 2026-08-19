import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCopilotMessagesIsPartial20260825000000
  implements MigrationInterface
{
  name = 'AddCopilotMessagesIsPartial20260825000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "copilot_messages" ADD COLUMN IF NOT EXISTS "isPartial" boolean NOT NULL DEFAULT false',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "copilot_messages" DROP COLUMN IF EXISTS "isPartial"',
    );
  }
}
