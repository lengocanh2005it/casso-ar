import type { MigrationInterface, QueryRunner } from 'typeorm';

// Preserve the original interval for pending deliveries that predate queue snapshots.
export class AddReminderExecutionMinInterval20261008020000
  implements MigrationInterface
{
  name = 'AddReminderExecutionMinInterval20261008020000';
  transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "reminder_executions" ADD COLUMN IF NOT EXISTS "minIntervalDays" integer',
    );
    await queryRunner.query(
      'UPDATE "reminder_executions" AS e SET "minIntervalDays" = r."minIntervalDays" FROM "reminder_rules" AS r INNER JOIN "reminder_policies" AS p ON p."id" = r."reminderPolicyId" WHERE e."reminderRuleId" = r."id" AND e."organizationId" = p."organizationId" AND e."status" = \'PENDING\' AND e."minIntervalDays" IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "reminder_executions" DROP COLUMN IF EXISTS "minIntervalDays"',
    );
  }
}
