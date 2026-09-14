import { IdempotencyService } from '../../../common/idempotency/idempotency.service';
import { ListWebhookInboxUseCase } from '../application/list-webhook-inbox.usecase';
import { ReprocessWebhookUseCase } from '../application/reprocess-webhook.usecase';
import { WebhookInbox } from '../domain/webhook-inbox';
import { WebhookInboxController } from './webhook-inbox.controller';

function buildInbox(overrides: Partial<WebhookInbox> = {}): WebhookInbox {
  return {
    id: 'inbox-1',
    bankConnectionId: 'bc-1',
    providerTransactionId: 'txn-1',
    rawPayload: {},
    receivedAt: new Date('2026-08-25T10:00:00Z'),
    status: 'FAILED',
    processedAt: null,
    errorMessage: 'boom',
    retryCount: 0,
    ...overrides,
  } as WebhookInbox;
}

describe('WebhookInboxController.reprocess', () => {
  it('routes the handler through IdempotencyService.execute with the request key', async () => {
    const inbox = buildInbox();
    const listUseCase = {
      execute: jest.fn(),
    } as unknown as ListWebhookInboxUseCase;
    const reprocessUseCase = {
      execute: jest.fn().mockResolvedValue(inbox),
    } as unknown as ReprocessWebhookUseCase;
    const idempotency = {
      execute: jest.fn(
        (
          _endpoint: string,
          _key: string | undefined,
          _input: unknown,
          operation: () => Promise<unknown>,
        ) => operation(),
      ),
    } as unknown as IdempotencyService;
    const controller = new WebhookInboxController(
      listUseCase,
      reprocessUseCase,
      idempotency,
    );

    const result = await controller.reprocess('inbox-1', 'key-abc');

    expect(idempotency.execute).toHaveBeenCalledWith(
      'POST /webhooks/inbox/inbox-1/reprocess',
      'key-abc',
      { id: 'inbox-1' },
      expect.any(Function),
    );
    expect(reprocessUseCase.execute).toHaveBeenCalledWith('inbox-1');
    expect(result).toMatchObject({ id: 'inbox-1', status: 'FAILED' });
  });
});
