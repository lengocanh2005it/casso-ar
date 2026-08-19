import type { QueryRunner } from 'typeorm';
import { AddOrganizationTaxCodeAndReviewStatus20260826000000 } from './20260826000000-add-organization-tax-code-and-review-status';

describe('AddOrganizationTaxCodeAndReviewStatus20260826000000', () => {
  it('adds the taxCode, taxCodeMatched, and taxCodeLookupName columns', async () => {
    const migration = new AddOrganizationTaxCodeAndReviewStatus20260826000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.up(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCode" character varying NOT NULL DEFAULT \'\'',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeMatched" boolean NOT NULL DEFAULT false',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeLookupName" character varying',
    );
  });

  it('reverts by dropping the columns', async () => {
    const migration = new AddOrganizationTaxCodeAndReviewStatus20260826000000();
    const query = jest.fn().mockResolvedValue([]);
    const queryRunner = { query } as unknown as QueryRunner;

    await migration.down(queryRunner);

    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeLookupName"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeMatched"',
    );
    expect(query).toHaveBeenCalledWith(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCode"',
    );
  });
});
