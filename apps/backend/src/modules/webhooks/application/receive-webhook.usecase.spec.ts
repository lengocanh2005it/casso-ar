import { ReceiveWebhookUseCase } from './receive-webhook.usecase';
import { DuplicateWebhookError } from './webhook-inbox-repository.port';

const input = {
  bankConnectionId: 'conn-1',
  transactionId: 'TX-1',
  rawPayload: {
    bankConnectionId: 'conn-1',
    transactionId: 'TX-1',
    amount: 1_000,
    transactionDateTime: '2026-08-01T00:00:00.000Z',
    counterpartyAccountNumber: '1234',
    counterpartyName: 'Payer',
    transferContent: 'Payment',
  },
};

describe('ReceiveWebhookUseCase', () => {
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
    const useCase = new ReceiveWebhookUseCase(
      inboxRepo as any,
      connectionRepo as any,
      queue as any,
      dataSource as any,
    );

    await expect(useCase.execute(input)).resolves.toEqual({
      received: true,
      duplicate: true,
    });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
