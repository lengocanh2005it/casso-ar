import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAlertsTable20260813010000 implements MigrationInterface {
  name = 'AddAlertsTable20260813010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "alerts_type_enum" AS ENUM (
          'BANK_CONNECTION_NEEDS_REAUTH',
          'BANK_CONNECTION_ERROR',
          'SMTP_FAILED',
          'REMINDER_SCAN_SUMMARY'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "alerts" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "userId" character varying NOT NULL,
        "type" "alerts_type_enum" NOT NULL,
        "entityType" character varying NOT NULL,
        "entityId" character varying NOT NULL,
        "readAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_alerts" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_alerts_organization_user_read" ON "alerts" ("organizationId", "userId", "readAt")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_alerts_user_entity_unread" ON "alerts" ("userId", "entityType", "entityId", "type") WHERE "readAt" IS NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_alerts_user_entity_unread"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_alerts_organization_user_read"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "alerts"');
    await queryRunner.query('DROP TYPE IF EXISTS "alerts_type_enum"');
  }
}
