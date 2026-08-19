import { WebhooksController } from './webhooks.controller';

const payload = {
  grantId: 'grant-1',
  transaction: {
    id: 'TX-1',
    amount: 1_000,
    transactionDateTime: '2026-08-01T00:00:00.000Z',
    description: 'Payment',
    counterAccountNumber: '1234',
    counterAccountName: 'Payer',
  },
};

describe('WebhooksController', () => {
  it('delegates to ReceiveWebhookUseCase with grantId and transaction.id', async () => {
    const receiveWebhook = {
      execute: jest
        .fn()
        .mockResolvedValue({ received: true, duplicate: false }),
    };
    const controller = new WebhooksController(receiveWebhook as any);

    await expect(
      controller.receiveBalanceHook(payload as any),
    ).resolves.toEqual({
      received: true,
      duplicate: false,
    });
    expect(receiveWebhook.execute).toHaveBeenCalledWith({
      grantId: 'grant-1',
      transactionId: 'TX-1',
      rawPayload: payload,
    });
  });
});
