import { describe, expect, it, vi } from 'vitest';

const { apiRequest, postWithIdempotency } = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  postWithIdempotency: vi.fn(),
}));

vi.mock('@/lib/api-client', () => ({
  apiRequest: (...args: unknown[]) => apiRequest(...args),
  postWithIdempotency: (...args: unknown[]) => postWithIdempotency(...args),
}));

import { fetchWebhookInbox, reprocessWebhookInbox } from './webhook-inbox-api';

describe('fetchWebhookInbox', () => {
  it('requests the inbox page with pagination and the provided filters', async () => {
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchWebhookInbox(
      { status: 'FAILED', providerTransactionId: 'TXN-001' },
      2,
      20,
    );

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/webhooks/inbox',
      method: 'GET',
      params: {
        page: 2,
        limit: 20,
        status: 'FAILED',
        providerTransactionId: 'TXN-001',
      },
    });
  });

  it('omits empty filters from the request params', async () => {
    apiRequest.mockResolvedValueOnce({ items: [], total: 0 });

    await fetchWebhookInbox({}, 1, 20);

    expect(apiRequest).toHaveBeenCalledWith({
      url: '/api/v1/webhooks/inbox',
      method: 'GET',
      params: { page: 1, limit: 20 },
    });
  });
});

describe('reprocessWebhookInbox', () => {
  it('posts to the reprocess endpoint via postWithIdempotency', async () => {
    postWithIdempotency.mockResolvedValueOnce({
      id: 'wh-1',
      status: 'PROCESSED',
    });

    await reprocessWebhookInbox('wh-1');

    expect(postWithIdempotency).toHaveBeenCalledWith(
      '/api/v1/webhooks/inbox/wh-1/reprocess',
    );
  });
});
