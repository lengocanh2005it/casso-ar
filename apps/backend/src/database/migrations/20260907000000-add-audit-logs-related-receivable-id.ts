import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAuditLogsRelatedReceivableId20260907000000
  implements MigrationInterface
{
  name = 'AddAuditLogsRelatedReceivableId20260907000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "relatedReceivableId" character varying',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_audit_logs_org_related_receivable_id" ON "audit_logs" ("organizationId", "relatedReceivableId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_audit_logs_org_related_receivable_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "audit_logs" DROP COLUMN IF EXISTS "relatedReceivableId"',
    );
  }
}
