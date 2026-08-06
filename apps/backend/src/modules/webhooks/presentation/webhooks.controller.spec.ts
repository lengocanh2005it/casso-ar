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
  it('delegates to ReceiveWebhookUseCase with the payload mapped to its input', async () => {
    const receiveWebhook = {
      execute: jest
        .fn()
        .mockResolvedValue({ received: true, duplicate: false }),
    };
    const controller = new WebhooksController(receiveWebhook as any);

    await expect(controller.receiveBalanceHook(payload)).resolves.toEqual({
      received: true,
      duplicate: false,
    });
    expect(receiveWebhook.execute).toHaveBeenCalledWith({
      bankConnectionId: 'conn-1',
      organizationId: undefined,
      transactionId: 'TX-1',
      rawPayload: payload,
    });
  });
});
