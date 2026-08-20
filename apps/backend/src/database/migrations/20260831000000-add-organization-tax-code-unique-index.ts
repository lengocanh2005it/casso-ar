import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationTaxCodeUniqueIndex20260831000000
  implements MigrationInterface
{
  name = 'AddOrganizationTaxCodeUniqueIndex20260831000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_organizations_tax_code" ON "organizations" ("taxCode") WHERE "taxCode" <> \'\'',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_organizations_tax_code"');
  }
}
