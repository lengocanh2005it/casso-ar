import { WebhooksController } from './webhooks.controller';

const payload = {
  error: 0,
  data: {
    id: 1,
    amount: 1_000,
    transactionDateTime: '2026-08-01 00:00:00',
    description: 'Payment',
    accountNumber: '0011002233',
    counterAccountNumber: '1234',
    counterAccountName: 'Payer',
  },
};

describe('WebhooksController', () => {
  it('delegates to ReceiveWebhookUseCase with accountNumber, the header secret, and data.id', async () => {
    const receiveWebhook = {
      execute: jest
        .fn()
        .mockResolvedValue({ received: true, duplicate: false }),
    };
    const controller = new WebhooksController(receiveWebhook as never);

    await expect(
      controller.receiveBalanceHook(payload as never, 'the-secret'),
    ).resolves.toEqual({ received: true, duplicate: false });
    expect(receiveWebhook.execute).toHaveBeenCalledWith({
      accountNumber: '0011002233',
      webhookSecret: 'the-secret',
      transactionId: '1',
      rawPayload: payload,
    });
  });
});
