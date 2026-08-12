import { WebhookInbox } from '../domain/webhook-inbox';
import { ListWebhookInboxUseCase } from './list-webhook-inbox.usecase';

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

describe('ListWebhookInboxUseCase', () => {
  it('returns a tenant-scoped page with an optional status filter', async () => {
    const repo = {
      insert: jest.fn(),
      save: jest.fn(),
      findById: jest.fn(),
      findPage: jest.fn().mockResolvedValue({
        items: [buildInbox()],
        total: 1,
      }),
    };
    const tenantContext = {
      getOrganizationId: jest.fn().mockReturnValue('org-1'),
    };
    const useCase = new ListWebhookInboxUseCase(
      repo as never,
      tenantContext as never,
    );

    const result = await useCase.execute({
      page: 1,
      limit: 20,
      status: 'FAILED',
    });

    expect(result).toEqual({ items: [buildInbox()], total: 1 });
    expect(repo.findPage).toHaveBeenCalledWith({
      organizationId: 'org-1',
      page: 1,
      limit: 20,
      status: 'FAILED',
    });
  });
});
