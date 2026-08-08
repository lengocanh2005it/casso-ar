import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInvoiceOrganizationInvoiceNumberIndex20260808000000
  implements MigrationInterface
{
  name = 'AddInvoiceOrganizationInvoiceNumberIndex20260808000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_invoices_organization_invoice_number" ON "invoices" ("organizationId", "invoiceNumber")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_invoices_organization_invoice_number"',
    );
  }
}
