import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLedgerEventsRolloutBaseline20260825000000
  implements MigrationInterface
{
  name = 'AddLedgerEventsRolloutBaseline20260825000000';
  transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('LOCK TABLE "receivables" IN SHARE MODE');
    await queryRunner.query('LOCK TABLE "payments" IN SHARE MODE');

    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ledger_events_receivable_rollout_baseline"
       ON "ledger_events" ("organizationId", "subjectId")
       WHERE "kind" = 'RECEIVABLE_ROLLOUT_BASELINE'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_ledger_events_payment_rollout_baseline"
       ON "ledger_events" ("organizationId", "subjectId")
       WHERE "kind" = 'PAYMENT_ROLLOUT_BASELINE'`,
    );

    await queryRunner.query(`
      INSERT INTO "ledger_events" (
        "id", "organizationId", "subjectType", "subjectId", "kind",
        "amount", "effectiveAt", "createdAt"
      )
      SELECT
        gen_random_uuid(), r."organizationId", 'RECEIVABLE', r."id",
        'RECEIVABLE_ROLLOUT_BASELINE', r."originalAmount" - r."paidAmount",
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "receivables" r
      WHERE r."originalAmount" - r."paidAmount" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_events" e
          WHERE e."organizationId" = r."organizationId"
            AND e."subjectId" = r."id"
            AND e."kind" = 'RECEIVABLE_ROLLOUT_BASELINE'
        )
    `);

    await queryRunner.query(`
      INSERT INTO "ledger_events" (
        "id", "organizationId", "subjectType", "subjectId", "kind",
        "amount", "effectiveAt", "createdAt"
      )
      SELECT
        gen_random_uuid(), p."organizationId", 'PAYMENT', p."id",
        'PAYMENT_ROLLOUT_BASELINE', p."totalAmount" - p."allocatedAmount",
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      FROM "payments" p
      WHERE p."totalAmount" - p."allocatedAmount" <> 0
        AND NOT EXISTS (
          SELECT 1 FROM "ledger_events" e
          WHERE e."organizationId" = p."organizationId"
            AND e."subjectId" = p."id"
            AND e."kind" = 'PAYMENT_ROLLOUT_BASELINE'
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_ledger_events_payment_rollout_baseline"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "UQ_ledger_events_receivable_rollout_baseline"',
    );
  }
}
