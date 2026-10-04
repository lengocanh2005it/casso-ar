import { WebhookInbox } from '../domain/webhook-inbox';
import {
  RecoverStaleWebhookInboxesUseCase,
  WEBHOOK_INBOX_STALE_AFTER_MS,
  WEBHOOK_INBOX_SWEEP_LIMIT,
} from './recover-stale-webhook-inboxes.usecase';

const now = new Date('2026-10-04T12:00:00.000Z');

function inbox(overrides: Record<string, unknown> = {}): WebhookInbox {
  return new WebhookInbox({
    id: 'inbox-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    providerTransactionId: 'TX-1',
    rawPayload: { error: 0, data: { id: 'TX-1', amount: 1000 } },
    receivedAt: new Date(now.getTime() - WEBHOOK_INBOX_STALE_AFTER_MS - 1000),
    status: 'RECEIVED',
    processedAt: null,
    errorMessage: null,
    retryCount: 0,
    ...overrides,
  });
}

function buildUseCase(stale: WebhookInbox[]) {
  const findStaleReceived = jest.fn().mockResolvedValue(stale);
  const enqueue = jest.fn().mockResolvedValue(undefined);
  const tenantContext = {
    run: jest.fn(async (_user: unknown, work: () => Promise<unknown>) =>
      work(),
    ),
  };
  const logger = { error: jest.fn(), warn: jest.fn() };
  const useCase = new RecoverStaleWebhookInboxesUseCase(
    { findStaleReceived } as never,
    { enqueue } as never,
    tenantContext as never,
    logger as never,
  );
  return { useCase, findStaleReceived, enqueue, tenantContext, logger };
}

describe('RecoverStaleWebhookInboxesUseCase (#421)', () => {
  it('sweeps only RECEIVED inboxes older than the stale window', async () => {
    const { useCase, findStaleReceived } = buildUseCase([]);

    await useCase.recover(now);

    expect(findStaleReceived).toHaveBeenCalledWith(
      new Date(now.getTime() - WEBHOOK_INBOX_STALE_AFTER_MS),
      WEBHOOK_INBOX_SWEEP_LIMIT,
    );
  });

  it('re-enqueues each stale inbox under its deterministic job id', async () => {
    const { useCase, enqueue } = buildUseCase([
      inbox(),
      inbox({ id: 'inbox-2', providerTransactionId: 'TX-2' }),
    ]);

    await useCase.recover(now);

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(enqueue).toHaveBeenNthCalledWith(1, {
      webhookInboxId: 'inbox-1',
      organizationId: 'org-1',
      jobId: 'tx-TX-1',
    });
    expect(enqueue).toHaveBeenNthCalledWith(2, {
      webhookInboxId: 'inbox-2',
      organizationId: 'org-1',
      jobId: 'tx-TX-2',
    });
  });

  it('keeps recovering the remaining inboxes after one enqueue fails, and logs the failure', async () => {
    const { useCase, enqueue, logger } = buildUseCase([
      inbox(),
      inbox({ id: 'inbox-2', providerTransactionId: 'TX-2' }),
    ]);
    enqueue.mockRejectedValueOnce(new Error('redis down'));

    await expect(useCase.recover(now)).resolves.toBeUndefined();

    expect(enqueue).toHaveBeenCalledTimes(2);
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Stale webhook inbox could not be re-enqueued',
        webhookInboxId: 'inbox-1',
        organizationId: 'org-1',
        error: 'redis down',
      }),
      expect.anything(),
      'RecoverStaleWebhookInboxesUseCase',
    );
  });
});
