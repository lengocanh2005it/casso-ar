import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogVerificationMethod20260906000000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogVerificationMethod20260906000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "verificationMethod" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "verificationMethod"',
    );
  }
}
