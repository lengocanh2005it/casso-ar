import type { QueryRunner } from 'typeorm';
import { AddOrganizationTaxCodeUniqueIndex20260831000000 } from './20260831000000-add-organization-tax-code-unique-index';

describe('AddOrganizationTaxCodeUniqueIndex20260831000000', () => {
  it('adds a unique index on non-empty taxCode', async () => {
    const migration = new AddOrganizationTaxCodeUniqueIndex20260831000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_organizations_tax_code" ON "organizations" ("taxCode") WHERE "taxCode" <> \'\'',
    );
  });

  it('reverts by dropping the index', async () => {
    const migration = new AddOrganizationTaxCodeUniqueIndex20260831000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "UQ_organizations_tax_code"',
    );
  });
});
