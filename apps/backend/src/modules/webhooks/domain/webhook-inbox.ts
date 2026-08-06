export type WebhookInboxStatus = 'RECEIVED' | 'PROCESSED' | 'FAILED';

export interface WebhookInboxProps {
  id: string;
  organizationId: string;
  bankConnectionId: string;
  providerTransactionId: string;
  rawPayload: Record<string, unknown>;
  receivedAt: Date;
  status: WebhookInboxStatus;
  processedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
}

export class WebhookInbox {
  readonly id: string;
  readonly organizationId: string;
  readonly bankConnectionId: string;
  readonly providerTransactionId: string;
  readonly rawPayload: Record<string, unknown>;
  readonly receivedAt: Date;
  readonly status: WebhookInboxStatus;
  readonly processedAt: Date | null;
  readonly errorMessage: string | null;
  readonly retryCount: number;

  constructor(props: WebhookInboxProps) {
    Object.assign(this, props);
  }

  markFailed(errorMessage: string): WebhookInbox {
    return new WebhookInbox({
      ...this,
      status: 'FAILED',
      errorMessage: errorMessage.slice(0, 500),
      retryCount: this.retryCount + 1,
    });
  }

  markProcessed(): WebhookInbox {
    return new WebhookInbox({
      ...this,
      status: 'PROCESSED',
      processedAt: new Date(),
      errorMessage: null,
    });
  }
}
