import type { MigrationInterface, QueryRunner } from 'typeorm';

// Leading-wildcard ILIKE (%term%) cannot use B-tree indexes; pg_trgm GIN
// indexes make the free-text search on customers/invoices/bank transactions
// index-assisted instead of a full table scan.
export class AddTrgmSearchIndexes20260813000000 implements MigrationInterface {
  name = 'AddTrgmSearchIndexes20260813000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_customers_name_trgm" ON "customers" USING GIN ("name" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_customers_tax_code_trgm" ON "customers" USING GIN ("taxCode" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_customers_phone_trgm" ON "customers" USING GIN ("phone" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_invoices_invoice_number_trgm" ON "invoices" USING GIN ("invoiceNumber" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_bank_transactions_counterparty_name_trgm" ON "bank_transactions" USING GIN ("counterpartyName" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_bank_transactions_counterparty_account_number_trgm" ON "bank_transactions" USING GIN ("counterpartyAccountNumber" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_bank_transactions_transfer_content_trgm" ON "bank_transactions" USING GIN ("transferContent" gin_trgm_ops)',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_customers_name_trgm"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_customers_tax_code_trgm"',
    );
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_customers_phone_trgm"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_invoices_invoice_number_trgm"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_bank_transactions_counterparty_name_trgm"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_bank_transactions_counterparty_account_number_trgm"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_bank_transactions_transfer_content_trgm"',
    );
  }
}
