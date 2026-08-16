import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogsInviteId20260823020000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogsInviteId20260823020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" ADD COLUMN IF NOT EXISTS "inviteId" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "operator_audit_logs" DROP COLUMN IF EXISTS "inviteId"',
    );
  }
}
