export const WEBHOOK_INBOX_STATUSES = [
  'RECEIVED',
  'PROCESSED',
  'FAILED',
] as const;

export type WebhookInboxStatus = (typeof WEBHOOK_INBOX_STATUSES)[number];

export interface WebhookInboxItem {
  id: string;
  bankConnectionId: string;
  providerTransactionId: string;
  rawPayload: Record<string, unknown>;
  receivedAt: string;
  status: WebhookInboxStatus;
  processedAt: string | null;
  errorMessage: string | null;
  retryCount: number;
}

export interface WebhookInboxPage {
  items: WebhookInboxItem[];
  total: number;
}

export interface WebhookInboxFilters {
  status?: WebhookInboxStatus;
  providerTransactionId?: string;
}

export interface WebhookInboxListQuery extends WebhookInboxFilters {
  page: number;
  limit: number;
}
