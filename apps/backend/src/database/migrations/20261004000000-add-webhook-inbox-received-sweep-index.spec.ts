import type { QueryRunner } from 'typeorm';
import { AddWebhookInboxReceivedSweepIndex20261004000000 } from './20261004000000-add-webhook-inbox-received-sweep-index';

describe('AddWebhookInboxReceivedSweepIndex20261004000000', () => {
  function makeRunner() {
    const query = jest.fn().mockResolvedValue([]);
    return { query, runner: { query } as unknown as QueryRunner };
  }

  it('indexes RECEIVED inboxes by receivedAt so the recovery sweep is not a full old-rows scan', async () => {
    const { query, runner } = makeRunner();

    await new AddWebhookInboxReceivedSweepIndex20261004000000().up(runner);

    expect(query).toHaveBeenCalledWith(
      `CREATE INDEX IF NOT EXISTS "IDX_webhook_inbox_received_status" ON "webhook_inbox" ("receivedAt") WHERE "status" = 'RECEIVED'`,
    );
  });

  it('drops the index on down', async () => {
    const { query, runner } = makeRunner();

    await new AddWebhookInboxReceivedSweepIndex20261004000000().down(runner);

    expect(query).toHaveBeenCalledWith(
      'DROP INDEX IF EXISTS "IDX_webhook_inbox_received_status"',
    );
  });
});
