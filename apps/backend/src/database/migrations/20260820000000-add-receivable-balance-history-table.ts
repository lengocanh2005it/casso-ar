import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceivableBalanceHistoryTable20260820000000
  implements MigrationInterface
{
  name = 'AddReceivableBalanceHistoryTable20260820000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "receivable_balance_history_status_enum" AS ENUM (
          'DRAFT',
          'OPEN',
          'PARTIALLY_PAID',
          'PAID',
          'WRITTEN_OFF',
          'CANCELLED'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "receivable_balance_history" (
        "id" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "receivableId" uuid NOT NULL,
        "status" "receivable_balance_history_status_enum" NOT NULL,
        "remainingAmount" bigint NOT NULL,
        "effectiveAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "changeSource" character varying NOT NULL,
        "changeReason" character varying,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "sequence" BIGSERIAL NOT NULL,
        CONSTRAINT "PK_receivable_balance_history" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_receivable_balance_history_remaining_amount"
          CHECK ("remainingAmount" >= 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_receivable_balance_history_organization_effective" ON "receivable_balance_history" ("organizationId", "effectiveAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_receivable_balance_history_organization_receivable_effective" ON "receivable_balance_history" ("organizationId", "receivableId", "effectiveAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_receivable_balance_history_organization_receivable_effective"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_receivable_balance_history_organization_effective"',
    );
    await queryRunner.query(
      'DROP TABLE IF EXISTS "receivable_balance_history"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "receivable_balance_history_status_enum"',
    );
  }
}
