import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogsMembershipId20260823010000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogsMembershipId20260823010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "membershipId" character varying`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "membershipId"',
    );
  }
}
