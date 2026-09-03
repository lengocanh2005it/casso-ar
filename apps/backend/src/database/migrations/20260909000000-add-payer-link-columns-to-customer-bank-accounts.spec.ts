import type { QueryRunner } from 'typeorm';
import { AddPayerLinkColumnsToCustomerBankAccounts20260909000000 } from './20260909000000-add-payer-link-columns-to-customer-bank-accounts';

describe('AddPayerLinkColumnsToCustomerBankAccounts20260909000000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('drops the old org+account unique index, adds provenance columns, backfills, and adds the per-customer partial unique index', async () => {
    const { query, runner } = makeRunner();
    await new AddPayerLinkColumnsToCustomerBankAccounts20260909000000().up(
      runner,
    );

    const sql = query.mock.calls.map((call) => call[0] as string);
    expect(sql).toEqual([
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_number"',
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedByUserId" varchar',
      'ALTER TABLE "customer_bank_accounts" ADD COLUMN IF NOT EXISTS "confirmedAt" timestamptz',
      'UPDATE "customer_bank_accounts" SET "confirmedAt" = "createdAt" WHERE "confirmedAt" IS NULL',
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_customer" ON "customer_bank_accounts" ("organizationId", "accountNumber", "customerId") WHERE "isActive"',
    ]);
  });

  it('reverts the columns and indexes', async () => {
    const { query, runner } = makeRunner();
    await new AddPayerLinkColumnsToCustomerBankAccounts20260909000000().down(
      runner,
    );

    const sql = query.mock.calls.map((call) => call[0] as string);
    expect(sql).toEqual([
      'DROP INDEX IF EXISTS "UQ_customer_bank_accounts_org_account_customer"',
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedAt"',
      'ALTER TABLE "customer_bank_accounts" DROP COLUMN IF EXISTS "confirmedByUserId"',
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_customer_bank_accounts_org_account_number" ON "customer_bank_accounts" ("organizationId", "accountNumber")',
    ]);
  });
});
