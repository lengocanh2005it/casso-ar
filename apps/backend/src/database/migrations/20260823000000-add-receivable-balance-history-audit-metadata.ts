import type { MigrationInterface, QueryRunner } from 'typeorm';

const VALID_UUID_PATTERN =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

export class AddReceivableBalanceHistoryAuditMetadata20260823000000
  implements MigrationInterface
{
  name = 'AddReceivableBalanceHistoryAuditMetadata20260823000000';
  transaction = true;

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "receivable_balance_history"
        ADD COLUMN IF NOT EXISTS "actorType" character varying,
        ADD COLUMN IF NOT EXISTS "actorUserId" uuid,
        ADD COLUMN IF NOT EXISTS "reasonCode" character varying,
        ADD COLUMN IF NOT EXISTS "note" character varying,
        ADD COLUMN IF NOT EXISTS "transitionReferenceId" uuid
    `);
    // Legacy rows keep all-null audit metadata; new rows must satisfy the
    // actor invariant: USER carries an actor id, SYSTEM/WEBHOOK never does.
    // Postgres has no ADD CONSTRAINT IF NOT EXISTS, so each constraint is
    // added conditionally in a DO block.
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'CHK_receivable_balance_history_actor_type'
        ) THEN
          ALTER TABLE "receivable_balance_history"
            ADD CONSTRAINT "CHK_receivable_balance_history_actor_type"
              CHECK ("actorType" IS NULL OR "actorType" IN ('USER', 'SYSTEM', 'WEBHOOK'));
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'CHK_receivable_balance_history_actor_user_id'
        ) THEN
          ALTER TABLE "receivable_balance_history"
            ADD CONSTRAINT "CHK_receivable_balance_history_actor_user_id"
              CHECK (
                ("actorType" IS NULL AND "actorUserId" IS NULL)
                OR ("actorType" = 'USER' AND "actorUserId" IS NOT NULL)
                OR ("actorType" IN ('SYSTEM', 'WEBHOOK') AND "actorUserId" IS NULL)
              );
        END IF;
      END $$;
    `);
    // Backfill the legacy reference: copy changeReason into
    // transitionReferenceId only when the source is an allocation flow, the
    // value is a valid UUID, and a matching allocation exists in the same
    // organization. All other legacy audit metadata stays null.
    await queryRunner.query(
      `
      UPDATE "receivable_balance_history" h
      SET "transitionReferenceId" = h."changeReason"::uuid
      WHERE h."changeSource" IN ('ALLOCATE', 'UNDO')
        AND h."changeReason" ~ '${VALID_UUID_PATTERN}'
        AND EXISTS (
          SELECT 1
          FROM "payment_allocations" pa
          WHERE pa.id = h."changeReason"::uuid
            AND pa."organizationId" = h."organizationId"
        )
    `,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "receivable_balance_history"
        DROP CONSTRAINT IF EXISTS "CHK_receivable_balance_history_actor_user_id",
        DROP CONSTRAINT IF EXISTS "CHK_receivable_balance_history_actor_type",
        DROP COLUMN IF EXISTS "transitionReferenceId",
        DROP COLUMN IF EXISTS "note",
        DROP COLUMN IF EXISTS "reasonCode",
        DROP COLUMN IF EXISTS "actorUserId",
        DROP COLUMN IF EXISTS "actorType"
    `);
  }
}
