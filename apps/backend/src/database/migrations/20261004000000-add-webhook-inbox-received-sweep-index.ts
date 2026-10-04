import type { MigrationInterface, QueryRunner } from 'typeorm';

// #421 recovery sweep reads RECEIVED inboxes older than a cutoff. The
// existing index on receivedAt alone would still scan every inbox row from the
// retention window before filtering on status, so this partial index matches
// the sweep's predicate and stays small once inboxes are processed.
export class AddWebhookInboxReceivedSweepIndex20261004000000
  implements MigrationInterface
{
  name = 'AddWebhookInboxReceivedSweepIndex20261004000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_webhook_inbox_received_status" ON "webhook_inbox" ("receivedAt") WHERE "status" = 'RECEIVED'`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "IDX_webhook_inbox_received_status"',
    );
  }
}
