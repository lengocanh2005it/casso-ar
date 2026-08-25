import type { WebhookInbox } from '../domain/webhook-inbox';

// rawPayload can carry bank account numbers / transfer content, so it is
// deliberately excluded from the audited view.
export function toAuditedWebhookInbox(inbox: WebhookInbox) {
  return {
    id: inbox.id,
    bankConnectionId: inbox.bankConnectionId,
    providerTransactionId: inbox.providerTransactionId,
    receivedAt: inbox.receivedAt,
    status: inbox.status,
    processedAt: inbox.processedAt,
    errorMessage: inbox.errorMessage,
    retryCount: inbox.retryCount,
  };
}
