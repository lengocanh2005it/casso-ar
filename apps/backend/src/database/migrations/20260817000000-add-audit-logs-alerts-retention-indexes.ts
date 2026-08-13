import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogsAlertsRetentionIndexes20260817000000
  implements MigrationInterface
{
  name = 'AddAuditLogsAlertsRetentionIndexes20260817000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_created_at" ON "audit_logs" ("createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_alerts_read_at" ON "alerts" ("readAt") WHERE "readAt" IS NOT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_alerts_read_at"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_audit_logs_created_at"');
  }
}
