import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetentionIndexes20260815000000 implements MigrationInterface {
  name = 'AddRetentionIndexes20260815000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_collection_activities_created_at" ON "collection_activities" ("createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_reminder_executions_created_at" ON "reminder_executions" ("createdAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_webhook_inbox_received_at" ON "webhook_inbox" ("receivedAt")',
    );
    await queryRunner.query(
      'CREATE INDEX IF NOT EXISTS "IDX_idempotency_keys_created_at" ON "idempotency_keys" ("createdAt")',
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_idempotency_keys_pending_created_at" ON "idempotency_keys" ("status", "createdAt") WHERE "status" = 'PENDING'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_idempotency_keys_pending_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_idempotency_keys_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_webhook_inbox_received_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_reminder_executions_created_at"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_collection_activities_created_at"',
    );
  }
}
