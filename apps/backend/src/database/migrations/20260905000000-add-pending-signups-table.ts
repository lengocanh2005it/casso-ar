import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPendingSignupsTable20260905000000
  implements MigrationInterface
{
  name = 'AddPendingSignupsTable20260905000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_signups" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" character varying NOT NULL,
        "passwordHash" character varying NOT NULL,
        "name" character varying NOT NULL,
        "organizationName" character varying NOT NULL,
        "taxCode" character varying NOT NULL,
        "taxCodeMatched" boolean NOT NULL,
        "taxCodeLookupName" character varying,
        "otpHash" character varying NOT NULL,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_pending_signups" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_email" ON "pending_signups" ("email")',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "UQ_pending_signups_tax_code" ON "pending_signups" ("taxCode")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "UQ_pending_signups_email"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_pending_signups_tax_code"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "pending_signups"');
  }
}
