import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBankConnectionGrantId20260827000000
  implements MigrationInterface
{
  name = 'AddBankConnectionGrantId20260827000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // No existing production data (only MockCasIdAdapter has ever run —
    // see docs/superpowers/specs/2026-08-19-cas-id-real-integration-design.md
    // §3.3), so this ships NOT NULL directly with no backfill step.
    await queryRunner.query(
      'ALTER TABLE "bank_connections" ADD COLUMN "grantId" character varying NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_bank_connections_grant_id" ON "bank_connections" ("grantId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_bank_connections_grant_id"',
    );
    await queryRunner.query(
      'ALTER TABLE "bank_connections" DROP COLUMN IF EXISTS "grantId"',
    );
  }
}
