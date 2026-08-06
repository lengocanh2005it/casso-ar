import type { EntityManager } from 'typeorm';
import type { WebhookInbox } from '../domain/webhook-inbox';

export class DuplicateWebhookError extends Error {
  constructor(providerTransactionId: string) {
    super(`Webhook ${providerTransactionId} already received`);
  }
}

export interface IWebhookInboxRepository {
  insert(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  save(inbox: WebhookInbox, manager?: EntityManager): Promise<void>;
  findById(id: string, organizationId: string): Promise<WebhookInbox | null>;
}

export const WEBHOOK_INBOX_REPOSITORY = Symbol('WEBHOOK_INBOX_REPOSITORY');
