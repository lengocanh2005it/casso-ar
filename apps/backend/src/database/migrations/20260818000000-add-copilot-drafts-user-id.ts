import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCopilotDraftsUserId20260818000000
  implements MigrationInterface
{
  name = 'AddCopilotDraftsUserId20260818000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "copilot_drafts" ADD COLUMN IF NOT EXISTS "userId" character varying',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_copilot_drafts_organization_user" ON "copilot_drafts" ("organizationId", "userId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_copilot_drafts_organization_user"',
    );
    await queryRunner.query(
      'ALTER TABLE "copilot_drafts" DROP COLUMN IF EXISTS "userId"',
    );
  }
}
