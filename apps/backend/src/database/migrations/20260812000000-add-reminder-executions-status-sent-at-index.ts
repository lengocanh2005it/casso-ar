import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReminderExecutionsStatusSentAtIndex20260812000000
  implements MigrationInterface
{
  name = 'AddReminderExecutionsStatusSentAtIndex20260812000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_reminder_executions_org_status_sentAt" ON "reminder_executions" ("organizationId", "status", "sentAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_reminder_executions_org_status_sentAt"',
    );
  }
}
