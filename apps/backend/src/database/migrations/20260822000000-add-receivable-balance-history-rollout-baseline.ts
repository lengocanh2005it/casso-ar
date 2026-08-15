import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReceivableBalanceHistoryRolloutBaseline20260822000000
  implements MigrationInterface
{
  name = 'AddReceivableBalanceHistoryRolloutBaseline20260822000000';
  transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    // The share lock waits for in-flight receivable transitions, then blocks
    // new amount/status writes until the baseline transaction commits.
    await queryRunner.query('LOCK TABLE "receivables" IN SHARE MODE');
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "receivable_balance_history_coverage" (
        "organizationId" character varying NOT NULL,
        "coveredFrom" TIMESTAMP WITH TIME ZONE NOT NULL,
        "reason" character varying NOT NULL,
        CONSTRAINT "PK_receivable_balance_history_coverage"
          PRIMARY KEY ("organizationId")
      )
    `);
    await queryRunner.query(`
      INSERT INTO "receivable_balance_history_coverage" (
        "organizationId",
        "coveredFrom",
        "reason"
      )
      SELECT source."organizationId", CURRENT_TIMESTAMP, 'HISTORY_COVERAGE_START'
      FROM (
        SELECT "id"::text AS "organizationId" FROM "organizations"
        UNION
        SELECT DISTINCT "organizationId" FROM "receivables"
      ) source
      ON CONFLICT ("organizationId") DO NOTHING
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_receivable_balance_history_rollout_baseline"
       ON "receivable_balance_history" ("organizationId", "receivableId")
       WHERE "changeSource" = 'ROLLOUT_BASELINE'`,
    );

    await queryRunner.query(`
      INSERT INTO "receivable_balance_history" (
        "id",
        "organizationId",
        "receivableId",
        "status",
        "remainingAmount",
        "effectiveAt",
        "changeSource",
        "changeReason",
        "createdAt"
      )
      SELECT
        gen_random_uuid(),
        r."organizationId",
        r."id",
        r."status"::text::"receivable_balance_history_status_enum",
        r."originalAmount" - r."paidAmount",
        CURRENT_TIMESTAMP,
        'ROLLOUT_BASELINE',
        'HISTORY_COVERAGE_START',
        CURRENT_TIMESTAMP
      FROM "receivables" r
      WHERE NOT EXISTS (
        SELECT 1
        FROM "receivable_balance_history" h
        WHERE h."organizationId" = r."organizationId"
          AND h."receivableId" = r."id"
          AND h."changeSource" = 'ROLLOUT_BASELINE'
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Balance history is immutable financial data; rollback removes only the
    // idempotency constraint and never deletes snapshots.
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_receivable_balance_history_rollout_baseline"',
    );
  }
}
