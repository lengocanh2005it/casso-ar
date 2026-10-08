import type { MigrationInterface, QueryRunner } from 'typeorm';

// Keeps the per-organization stale-pending sweep on its filter and sort keys.
export class AddReminderExecutionRecoveryIndex20261008010000
  implements MigrationInterface
{
  name = 'AddReminderExecutionRecoveryIndex20261008010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_reminder_executions_pending_recovery" ON "reminder_executions" ("organizationId", "createdAt") WHERE "status" = \'PENDING\' AND "reminderRuleId" IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_reminder_executions_pending_recovery"',
    );
  }
}
