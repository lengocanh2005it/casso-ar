import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanUpgradeOrdersTable20260813000000
  implements MigrationInterface
{
  name = 'AddPlanUpgradeOrdersTable20260813000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "plan_upgrade_orders_targetPlanId_enum" AS ENUM ('FREE', 'STARTER', 'BUSINESS', 'ENTERPRISE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "plan_upgrade_orders_status_enum" AS ENUM ('PENDING', 'PAID', 'FAILED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "plan_upgrade_orders" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "orderCode" bigserial NOT NULL,
        "organizationId" character varying NOT NULL,
        "targetPlanId" "plan_upgrade_orders_targetPlanId_enum" NOT NULL,
        "status" "plan_upgrade_orders_status_enum" NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_plan_upgrade_orders" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      'CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plan_upgrade_orders_order_code" ON "plan_upgrade_orders" ("orderCode")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_plan_upgrade_orders_organization" ON "plan_upgrade_orders" ("organizationId")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_plan_upgrade_orders_organization"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_plan_upgrade_orders_order_code"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "plan_upgrade_orders"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "plan_upgrade_orders_status_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "plan_upgrade_orders_targetPlanId_enum"',
    );
  }
}
