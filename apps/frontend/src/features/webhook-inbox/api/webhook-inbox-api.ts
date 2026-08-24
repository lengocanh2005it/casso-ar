import { apiRequest, postWithIdempotency } from '@/lib/api-client';
import type {
  WebhookInboxFilters,
  WebhookInboxItem,
  WebhookInboxPage,
} from '../types';

export function fetchWebhookInbox(
  filters: WebhookInboxFilters,
  page: number,
  limit: number,
): Promise<WebhookInboxPage> {
  return apiRequest<WebhookInboxPage>({
    url: '/api/v1/webhooks/inbox',
    method: 'GET',
    params: { page, limit, ...filters },
  });
}

export function reprocessWebhookInbox(id: string): Promise<WebhookInboxItem> {
  return postWithIdempotency<WebhookInboxItem>(
    `/api/v1/webhooks/inbox/${id}/reprocess`,
  );
}
