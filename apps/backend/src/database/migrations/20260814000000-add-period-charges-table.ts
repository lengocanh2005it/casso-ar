import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPeriodChargesTable20260814000000 implements MigrationInterface {
  name = 'AddPeriodChargesTable20260814000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "period_charges_planId_enum" AS ENUM ('FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "period_charges_status_enum" AS ENUM ('PENDING', 'PAID', 'FAILED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "period_charges" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orderCode" bigserial NOT NULL,
        "organizationId" character varying NOT NULL,
        "planId" "period_charges_planId_enum" NOT NULL,
        "periodStart" TIMESTAMP WITH TIME ZONE NOT NULL,
        "periodEnd" TIMESTAMP WITH TIME ZONE NOT NULL,
        "status" "period_charges_status_enum" NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_period_charges" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_period_charges_order_code" ON "period_charges" ("orderCode")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_period_charges_organization_period_start" ON "period_charges" ("organizationId", "periodStart")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_period_charges_organization_period_start"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_period_charges_order_code"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "period_charges"');
    await queryRunner.query('DROP TYPE IF EXISTS "period_charges_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "period_charges_planId_enum"');
  }
}
