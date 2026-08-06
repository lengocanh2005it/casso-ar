import { DuplicateWebhookError } from '../application/webhook-inbox-repository.port';
import { WebhooksController } from './webhooks.controller';

const payload = {
  bankConnectionId: 'conn-1',
  transactionId: 'TX-1',
  amount: 1_000,
  transactionDateTime: '2026-08-01T00:00:00.000Z',
  counterpartyAccountNumber: '1234',
  counterpartyName: 'Payer',
  transferContent: 'Payment',
};

describe('WebhooksController', () => {
  it('returns duplicate without enqueueing a webhook already protected by the unique key', async () => {
    const inboxRepo = {
      insert: jest.fn().mockRejectedValue(new DuplicateWebhookError('TX-1')),
    };
    const connectionRepo = {
      findByIdUnscoped: jest.fn().mockResolvedValue({
        organizationId: 'org-1',
        id: 'conn-1',
        isUsable: () => true,
      }),
    };
    const queue = { add: jest.fn() };
    const dataSource = {
      transaction: jest.fn(
        async (callback: (manager: object) => Promise<void>) => callback({}),
      ),
    };
    const controller = new WebhooksController(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(controller.receiveBalanceHook(payload)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
