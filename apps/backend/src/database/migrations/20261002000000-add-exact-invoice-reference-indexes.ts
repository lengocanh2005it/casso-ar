import type { MigrationInterface, QueryRunner } from 'typeorm';

// Matching looks up open receivables whose invoice number appears in a bank
// transfer's content. The invoice side is compared in normalized form (ASCII
// letters and digits, upper case), so the lookup needs an expression index
// with exactly this expression; receivables then need an invoiceId index.
export class AddExactInvoiceReferenceIndexes20261002000000
  implements MigrationInterface
{
  name = 'AddExactInvoiceReferenceIndexes20261002000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_invoices_organization_normalized_number" ON "invoices" ("organizationId", (upper(regexp_replace("invoiceNumber", '[^A-Za-z0-9]', '', 'g'))))`,
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_receivables_organization_invoice" ON "receivables" ("organizationId", "invoiceId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_receivables_organization_invoice"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_invoices_organization_normalized_number"',
    );
  }
}
