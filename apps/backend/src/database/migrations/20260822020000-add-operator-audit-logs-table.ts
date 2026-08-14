import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOperatorAuditLogsTable20260822020000
  implements MigrationInterface
{
  name = 'AddOperatorAuditLogsTable20260822020000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "operator_audit_logs" (
        "id" uuid NOT NULL,
        "operatorId" character varying NOT NULL,
        "organizationId" character varying NOT NULL,
        "actionType" character varying NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_operator_audit_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_operator_audit_logs_organization" ON "operator_audit_logs" ("organizationId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_operator_audit_logs_organization"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "operator_audit_logs"');
  }
}
