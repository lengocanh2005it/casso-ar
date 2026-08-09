import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInternalTasksAndEscalationThreshold20260809000000
  implements MigrationInterface
{
  name = 'AddInternalTasksAndEscalationThreshold20260809000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "reminder_policies" ADD COLUMN IF NOT EXISTS "escalationThresholdDays" integer NOT NULL DEFAULT 30',
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "internal_tasks_taskType_enum" AS ENUM ('ESCALATION', 'MANUAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "internal_tasks_status_enum" AS ENUM ('OPEN', 'DONE', 'DISMISSED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "internal_tasks" (
        "id" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "receivableId" character varying NOT NULL,
        "assignedToUserId" character varying NOT NULL,
        "createdByUserId" character varying,
        "taskType" "internal_tasks_taskType_enum" NOT NULL,
        "title" character varying NOT NULL,
        "description" text,
        "dueDate" date,
        "status" "internal_tasks_status_enum" NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "resolvedAt" TIMESTAMP,
        "version" integer NOT NULL DEFAULT 1,
        CONSTRAINT "PK_internal_tasks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_internal_tasks_organization_receivable_status" ON "internal_tasks" ("organizationId", "receivableId", "status")',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_internal_open_escalation_per_receivable"
       ON "internal_tasks" ("organizationId", "receivableId")
       WHERE "taskType" = 'ESCALATION' AND "status" = 'OPEN'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "uq_internal_open_escalation_per_receivable"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_internal_tasks_organization_receivable_status"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "internal_tasks"');
    await queryRunner.query('DROP TYPE IF EXISTS "internal_tasks_status_enum"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "internal_tasks_taskType_enum"',
    );
    await queryRunner.query(
      'ALTER TABLE "reminder_policies" DROP COLUMN IF EXISTS "escalationThresholdDays"',
    );
  }
}
