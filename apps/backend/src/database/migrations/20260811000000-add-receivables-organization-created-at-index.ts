import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceivablesOrganizationCreatedAtIndex20260811000000
  implements MigrationInterface
{
  name = 'AddReceivablesOrganizationCreatedAtIndex20260811000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_receivables_organization_created_at" ON "receivables" ("organizationId", "createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_receivables_organization_created_at"',
    );
  }
}
