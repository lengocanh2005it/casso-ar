import { WebhookInbox } from './webhook-inbox';

const props = {
  id: 'wh-1',
  organizationId: 'org-1',
  bankConnectionId: 'conn-1',
  providerTransactionId: 'TX-001',
  rawPayload: {},
  receivedAt: new Date('2026-08-01'),
  status: 'RECEIVED' as const,
  processedAt: null,
  errorMessage: null,
  retryCount: 0,
};

describe('WebhookInbox', () => {
  it('tracks received, failed, and processed states', () => {
    const inbox = new WebhookInbox(props);
    expect(inbox.status).toBe('RECEIVED');
    expect(inbox.markFailed('normalizer error')).toMatchObject({
      status: 'FAILED',
      retryCount: 1,
    });
    expect(inbox.markProcessed()).toMatchObject({
      status: 'PROCESSED',
      errorMessage: null,
    });
  });
});
