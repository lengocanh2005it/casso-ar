import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogReason20260826010000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogReason20260826010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "reason" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "reason"',
    );
  }
}
