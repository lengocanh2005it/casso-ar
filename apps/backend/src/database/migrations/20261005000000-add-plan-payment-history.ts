import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPlanPaymentHistory20261005000000 implements MigrationInterface {
  name = 'AddPlanPaymentHistory20261005000000';
  transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'LOCK TABLE "plan_upgrade_orders", "period_charges" IN SHARE MODE',
    );
    await queryRunner.query(
      `ALTER TYPE "plan_upgrade_orders_status_enum" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED'`,
    );
    await queryRunner.query(
      `ALTER TYPE "period_charges_status_enum" ADD VALUE IF NOT EXISTS 'REVIEW_REQUIRED'`,
    );
    await queryRunner.query(
      'ALTER TABLE "plan_upgrade_orders" ADD COLUMN IF NOT EXISTS "quotedAmount" bigint, ADD COLUMN IF NOT EXISTS "payosPaymentLinkId" character varying',
    );
    await queryRunner.query(
      'ALTER TABLE "period_charges" ADD COLUMN IF NOT EXISTS "quotedAmount" bigint, ADD COLUMN IF NOT EXISTS "payosPaymentLinkId" character varying',
    );
    await queryRunner.query(`
      CREATE TYPE "plan_payment_history_sourceType_enum" AS ENUM (
        'PLAN_UPGRADE_ORDER',
        'PERIOD_CHARGE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "plan_payment_history_initialOutcome_enum" AS ENUM (
        'ACCEPTED',
        'REVIEW_REQUIRED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "plan_payment_history_provenance_enum" AS ENUM (
        'PAYOS_WEBHOOK',
        'LEGACY_BACKFILL'
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "plan_payment_history" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "organizationId" character varying NOT NULL,
        "sourceType" "plan_payment_history_sourceType_enum" NOT NULL,
        "sourceId" uuid NOT NULL,
        "orderCode" bigint NOT NULL,
        "planId" "plan_upgrade_orders_targetPlanId_enum" NOT NULL,
        "periodStart" TIMESTAMP WITH TIME ZONE,
        "periodEnd" TIMESTAMP WITH TIME ZONE,
        "receivedAmount" bigint,
        "quotedAmount" bigint,
        "payosPaymentLinkId" character varying,
        "providerReference" character varying,
        "providerTransactionTime" character varying,
        "transferIdentity" character varying,
        "deliveryFingerprint" character varying,
        "initialOutcome" "plan_payment_history_initialOutcome_enum" NOT NULL,
        "provenance" "plan_payment_history_provenance_enum" NOT NULL,
        "confirmedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        CONSTRAINT "PK_plan_payment_history" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_plan_payment_history_received_amount"
          CHECK ("receivedAmount" IS NULL OR "receivedAmount" > 0),
        CONSTRAINT "CHK_plan_payment_history_quoted_amount"
          CHECK ("quotedAmount" IS NULL OR "quotedAmount" > 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "IDX_plan_payment_history_organization_confirmed" ON "plan_payment_history" ("organizationId", "confirmedAt" DESC, "id" DESC)',
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_plan_payment_history_legacy_source" ON "plan_payment_history" ("organizationId", "sourceType", "sourceId") WHERE "provenance" = 'LEGACY_BACKFILL'`,
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_plan_payment_history_transfer_identity" ON "plan_payment_history" ("organizationId", "payosPaymentLinkId", "transferIdentity") WHERE "transferIdentity" IS NOT NULL',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "UQ_plan_payment_history_delivery_fingerprint" ON "plan_payment_history" ("organizationId", "deliveryFingerprint") WHERE "deliveryFingerprint" IS NOT NULL',
    );
    await queryRunner.query(`
      INSERT INTO "plan_payment_history" (
        "organizationId", "sourceType", "sourceId", "orderCode", "planId",
        "periodStart", "periodEnd", "receivedAmount", "quotedAmount",
        "initialOutcome", "provenance", "confirmedAt", "createdAt"
      )
      SELECT
        sourceOrder."organizationId",
        'PLAN_UPGRADE_ORDER',
        sourceOrder."id",
        sourceOrder."orderCode",
        sourceOrder."targetPlanId",
        NULL,
        NULL,
        NULL,
        NULL,
        'ACCEPTED',
        'LEGACY_BACKFILL',
        sourceOrder."updatedAt",
        sourceOrder."updatedAt"
      FROM "plan_upgrade_orders" sourceOrder
      WHERE sourceOrder."status"::text = 'PAID'
      ON CONFLICT DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO "plan_payment_history" (
        "organizationId", "sourceType", "sourceId", "orderCode", "planId",
        "periodStart", "periodEnd", "receivedAmount", "quotedAmount",
        "initialOutcome", "provenance", "confirmedAt", "createdAt"
      )
      SELECT
        sourceOrder."organizationId",
        'PERIOD_CHARGE',
        sourceOrder."id",
        sourceOrder."orderCode" + 100000000,
        sourceOrder."planId"::text::"plan_upgrade_orders_targetPlanId_enum",
        sourceOrder."periodStart",
        sourceOrder."periodEnd",
        NULL,
        NULL,
        'ACCEPTED',
        'LEGACY_BACKFILL',
        sourceOrder."updatedAt",
        sourceOrder."updatedAt"
      FROM "period_charges" sourceOrder
      WHERE sourceOrder."status"::text = 'PAID'
      ON CONFLICT DO NOTHING
    `);
  }

  async down(_queryRunner: QueryRunner): Promise<void> {
    // ponytail: keep immutable receipt rows and their schema on rollback; a destructive rollback would erase payment evidence.
  }
}
