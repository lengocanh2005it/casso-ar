import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankTransactionsOrganizationCreatedAtIndex20260809010000
  implements MigrationInterface
{
  name = 'AddBankTransactionsOrganizationCreatedAtIndex20260809010000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_2503cc8664ad417d149e6dbfc0" ON "bank_transactions" ("organizationId", "createdAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_2503cc8664ad417d149e6dbfc0"',
    );
  }
}
