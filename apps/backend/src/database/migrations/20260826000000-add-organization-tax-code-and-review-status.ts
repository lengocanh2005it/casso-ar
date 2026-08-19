import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrganizationTaxCodeAndReviewStatus20260826000000
  implements MigrationInterface
{
  name = 'AddOrganizationTaxCodeAndReviewStatus20260826000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCode" character varying NOT NULL DEFAULT \'\'',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeMatched" boolean NOT NULL DEFAULT false',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "taxCodeLookupName" character varying',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeLookupName"',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCodeMatched"',
    );
    await queryRunner.query(
      'ALTER TABLE "organizations" DROP COLUMN IF EXISTS "taxCode"',
    );
  }
}
