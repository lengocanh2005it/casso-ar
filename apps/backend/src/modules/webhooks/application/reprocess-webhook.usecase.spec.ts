import { ErrorCode } from '../../../common/errors/error-code';
import { WebhookInbox } from '../domain/webhook-inbox';
import { ReprocessWebhookUseCase } from './reprocess-webhook.usecase';

function buildInbox(
  overrides: Partial<ConstructorParameters<typeof WebhookInbox>[0]> = {},
): WebhookInbox {
  return new WebhookInbox({
    id: 'inbox-1',
    organizationId: 'org-1',
    bankConnectionId: 'conn-1',
    providerTransactionId: 'txn-1',
    rawPayload: { amount: 1000 },
    receivedAt: new Date('2026-08-12'),
    status: 'FAILED',
    processedAt: null,
    errorMessage: 'match failed',
    retryCount: 5,
    ...overrides,
  });
}

describe('ReprocessWebhookUseCase', () => {
  it('re-enqueues a FAILED webhook with a deterministic job id', async () => {
    const repo = {
      insert: jest.fn(),
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(buildInbox()),
      findPage: jest.fn(),
    };
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
    );

    const result = await useCase.execute('inbox-1');

    expect(result.id).toBe('inbox-1');
    expect(repo.findById).toHaveBeenCalledWith('inbox-1', 'org-1');
    expect(enqueue).toHaveBeenCalledWith({
      webhookInboxId: 'inbox-1',
      organizationId: 'org-1',
      jobId: 'webhook-reprocess-inbox-1',
    });
  });

  it('rejects reprocessing a webhook that is not FAILED', async () => {
    const repo = {
      insert: jest.fn(),
      save: jest.fn(),
      findById: jest
        .fn()
        .mockResolvedValue(buildInbox({ status: 'PROCESSED' })),
      findPage: jest.fn(),
    };
    const enqueue = jest.fn();
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
    );

    await expect(useCase.execute('inbox-1')).rejects.toMatchObject({
      errorCode: ErrorCode.CONFLICT,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('rejects reprocessing a webhook that does not exist in the org', async () => {
    const repo = {
      insert: jest.fn(),
      save: jest.fn(),
      findById: jest.fn().mockResolvedValue(null),
      findPage: jest.fn(),
    };
    const enqueue = jest.fn();
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new ReprocessWebhookUseCase(
      repo as never,
      { enqueue } as never,
      tenantContext as never,
    );

    await expect(useCase.execute('inbox-1')).rejects.toMatchObject({
      errorCode: ErrorCode.NOT_FOUND,
    });
    expect(enqueue).not.toHaveBeenCalled();
  });
});
