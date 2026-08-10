import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCustomerBankAccountStatus20260810030000
  implements MigrationInterface
{
  name = 'AddCustomerBankAccountStatus20260810030000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "isActive" boolean NOT NULL DEFAULT true',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz NOT NULL DEFAULT now()',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_66e0e9e3f7a61b1faa753ba787"',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_number" ON "customer_bank_accounts" ("organizationId", "accountNumber")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_number"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "updatedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "isActive"',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_66e0e9e3f7a61b1faa753ba787" ON "customer_bank_accounts" ("organizationId", "accountNumber")',
    );
  }
}
