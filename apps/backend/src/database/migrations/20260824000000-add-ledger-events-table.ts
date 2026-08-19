import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLedgerEventsTable20260824000000 implements MigrationInterface {
  name = 'AddLedgerEventsTable20260824000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "ledger_event_subject_type_enum" AS ENUM ('RECEIVABLE', 'PAYMENT');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(
      `DO $$ BEGIN
        CREATE TYPE "ledger_event_kind_enum" AS ENUM (
          'RECEIVABLE_CREATED',
          'RECEIVABLE_ALLOCATED',
          'RECEIVABLE_ALLOCATION_UNDONE',
          'RECEIVABLE_CANCELLED',
          'RECEIVABLE_WRITTEN_OFF',
          'RECEIVABLE_ROLLOUT_BASELINE',
          'PAYMENT_RECEIVED',
          'PAYMENT_ALLOCATED',
          'PAYMENT_ALLOCATION_UNDONE',
          'PAYMENT_ROLLOUT_BASELINE'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "ledger_events" (
        "id" uuid NOT NULL,
        "organizationId" character varying NOT NULL,
        "subjectType" "ledger_event_subject_type_enum" NOT NULL,
        "subjectId" uuid NOT NULL,
        "kind" "ledger_event_kind_enum" NOT NULL,
        "amount" bigint NOT NULL,
        "effectiveAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "transitionReferenceId" uuid,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "sequence" BIGSERIAL NOT NULL,
        CONSTRAINT "PK_ledger_events" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_ledger_events_amount_not_zero" CHECK ("amount" <> 0)
      )
    `);
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ledger_events_organization_effective" ON "ledger_events" ("organizationId", "effectiveAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_ledger_events_organization_subject_effective" ON "ledger_events" ("organizationId", "subjectType", "subjectId", "effectiveAt")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_ledger_events_organization_subject_effective"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_ledger_events_organization_effective"',
    );
    await queryRunner.query('DROP TABLE IF EXISTS "ledger_events"');
    await queryRunner.query('DROP TYPE IF EXISTS "ledger_event_kind_enum"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "ledger_event_subject_type_enum"',
    );
  }
}
