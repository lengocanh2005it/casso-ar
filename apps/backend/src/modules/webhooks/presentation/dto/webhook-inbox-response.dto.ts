import type { WebhookInboxStatus } from '../../domain/webhook-inbox';

export class WebhookInboxItemResponse {
  id: string;
  bankConnectionId: string;
  providerTransactionId: string;
  rawPayload: Record<string, unknown>;
  receivedAt: Date;
  status: WebhookInboxStatus;
  processedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

export class ListWebhookInboxResponseDto {
  items: WebhookInboxItemResponse[];
  total: number;
}
