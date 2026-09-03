import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPayerLinkColumnsToCustomerBankAccounts20260909000000
  implements MigrationInterface
{
  name = 'AddPayerLinkColumnsToCustomerBankAccounts20260909000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // A payer account may now be linked to more than one customer, so the
    // (organizationId, accountNumber) pair is no longer unique.
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_number"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedByUserId" varchar',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedAt" timestamptz',
    );
    // Existing rows were deliberately created by a user through the management
    // UI, so treat them as confirmed at creation time. The acting user is
    // unknown for legacy rows, so confirmedByUserId stays NULL.
    await queryRunner.query(
      'UPDATE "customer_bank_accounts" SET "confirmedAt" = "createdAt" WHERE "confirmedAt" IS NULL',
    );
    // A customer still cannot have the same active payer account linked twice.
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_customer" ON "customer_bank_accounts" ("organizationId", "accountNumber", "customerId") WHERE "isActive"',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_customer"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedAt"',
    );
    await queryRunner.query(
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedByUserId"',
    );
    // Recreating the old unique index fails if a payer account is already
    // linked to more than one customer. This is a forward-only rollout.
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_number" ON "customer_bank_accounts" ("organizationId", "accountNumber")',
    );
  }
}
